package com.github.nicorac.xposed;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.provider.CallLog;
import android.text.TextUtils;
import android.util.SparseArray;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewStub;
import android.widget.TextView;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;


/**
 * Injects a play button into the dialer's expanded call-log row.
 *
 * Deliberately driven by *resource entry names* rather than class names. Google Dialer
 * ships obfuscated, so its classes are unusable as hook targets, but it descends from
 * AOSP Dialer and keeps the AOSP resource names ({@code details_action},
 * {@code send_message_action}, ...) which R8 does not rename. That makes one
 * implementation cover AOSP, LineageOS and Google Dialer instead of one per fork.
 *
 * When it still fails on a given dialer, long-pressing any action button writes a full
 * view-tree and view-holder dump to the log for diagnosis -- see {@link XLog}.
 */
final class DialerHook {

  /** Marks the button we injected, so recycled rows are not decorated twice. */
  private static final String MARKER = "bcr-gui-play";
  /** Same, for the small "has a recording" badge on the collapsed row. */
  private static final String MARKER_DOT = "bcr-gui-rec";

  /** Which dialer this process is, and therefore which resource names to look for. */
  private static volatile DialerProfile profile = DialerProfiles.GENERIC;

  /**
   * Lookups are provider IPC, so a single thread serialised every visible row behind
   * the slowest one. Small pool: enough to keep a fling responsive, bounded so a long
   * list cannot spawn a thread per row.
   */
  private static final ExecutorService WORKER = Executors.newFixedThreadPool(3);
  private static final Handler UI = new Handler(Looper.getMainLooper());

  private static final SparseArray<String> ID_NAMES = new SparseArray<>();

  /** LRU of lookup results, keyed by "number|date". */
  private static final Map<String, RecordingIndex.Match> MATCHES =
    new LinkedHashMap<String, RecordingIndex.Match>(64, 0.75f, true) {
      @Override
      protected boolean removeEldestEntry(Map.Entry<String, RecordingIndex.Match> eldest) {
        return size() > 256;
      }
    };

  /** Buttons with a lookup already running, so layout passes don't pile up requests. */
  private static final java.util.WeakHashMap<View, Boolean> IN_FLIGHT = new java.util.WeakHashMap<>();

  /** True when BCR-GUI could not be reached: inject the button regardless, so the
   *  long-press dump stays available for diagnosis. */
  private static volatile boolean diagnosticsMode;
  private static volatile boolean actionRowFound;
  private static int seenIdReports;
  private static int rowDumps;
  private static int identityFailures;
  private static int holderDumps;
  private static int holderPathLogged;
  private static int iconSetterLogged;
  private static int lookupReports;

  /** Most recent view holder resolved, for diagnostics only. */
  private static volatile Object lastHolder;




  /** Sibling each injected button copies its look from. */
  private static final java.util.WeakHashMap<View, Object> STYLE_SOURCE =
    new java.util.WeakHashMap<>();
  /** rendered string -> the name of the resource it came from. */
  private static final Map<String, String> STRING_RESOURCES =
    java.util.Collections.synchronizedMap(new LinkedHashMap<String, String>(64, 0.75f, true) {
      @Override
      protected boolean removeEldestEntry(Map.Entry<String, String> eldest) {
        return size() > 512;
      }
    });

  /** view -> the name of the string resource its label came from. */
  private static final java.util.WeakHashMap<View, String> LABEL_RESOURCES =
    new java.util.WeakHashMap<>();

  /** number -> whether any recording exists for it at all. */
  private static final Map<String, Boolean> CONTACT_HAS_ANY =
    java.util.Collections.synchronizedMap(new java.util.HashMap<>());

  /** control -> the identity key its current contents belong to. */
  private static final java.util.WeakHashMap<View, String> BOUND_KEYS =
    new java.util.WeakHashMap<>();

  /** holder -> { fingerprint, identity }: valid while the row still shows the same. */
  private static final java.util.WeakHashMap<Object, Object[]> IDENTITY_MEMO =
    new java.util.WeakHashMap<>();

  /**
   * Cheap description of what a row currently displays.
   *
   * The call-log card carries a full contentDescription ("<name>, movil, llamada
   * realizada, hace 20 minutos, ..."), which changes on every rebind. Rows without
   * one fall back to their first couple of text values.
   */
  private static String fingerprint(View item) {
    CharSequence desc = item.getContentDescription();
    if (desc != null && desc.length() > 0) return desc.toString();
    StringBuilder sb = new StringBuilder();
    collectText(item, 0, sb);
    return sb.length() == 0 ? null : sb.toString();
  }

  private static void collectText(View v, int depth, StringBuilder out) {
    // Deep enough to reach a history row's own text. At depth 4 the only text within
    // reach of the list's item view was call_duration, so every row's fingerprint was
    // just its duration and two calls of equal length looked like the same row -- the
    // memo then returned the earlier row's identity, and its recording with it.
    if (depth > 8 || out.length() > 240) return;
    if (v instanceof TextView) {
      CharSequence t = ((TextView) v).getText();
      if (t != null && t.length() > 0) out.append(t).append('|');
      return;
    }
    if (v instanceof ViewGroup) {
      ViewGroup vg = (ViewGroup) v;
      for (int i = 0; i < vg.getChildCount(); i++) collectText(vg.getChildAt(i), depth + 1, out);
    }
  }

  /** LayoutParams class -> the field holding its ViewHolder, resolved once. */
  private static final Map<Class<?>, java.lang.reflect.Field> HOLDER_FIELDS =
    java.util.Collections.synchronizedMap(new java.util.HashMap<>());

  /** Which anchor each history button is currently positioned against. */
  private static final java.util.WeakHashMap<View, Object> HISTORY_PLACED =
    new java.util.WeakHashMap<>();

  /** Buttons already styled, so the sampling happens once. */
  private static final java.util.WeakHashMap<View, Boolean> STYLED =
    new java.util.WeakHashMap<>();

  /** Row roots already being watched, mapped to their last visible-view count. */
  private static final java.util.WeakHashMap<ViewGroup, Integer> ROW_DUMPS =
    new java.util.WeakHashMap<>();

  /** Lists we already watch. */
  private static final java.util.WeakHashMap<ViewGroup, Boolean> LISTS =
    new java.util.WeakHashMap<>();

  /** Bounded, so a provider that never answers cannot become a polling loop. */
  private static final java.util.concurrent.atomic.AtomicInteger RETRIES =
    new java.util.concurrent.atomic.AtomicInteger();

  /** Badge containers decorated at least once, to spot the host discarding it. */
  private static final java.util.WeakHashMap<ViewGroup, Boolean> BADGED =
    new java.util.WeakHashMap<>();

  /** Coalesces the immediate sweeps requested as lookups land. */
  private static final java.util.concurrent.atomic.AtomicBoolean SWEEP_PENDING =
    new java.util.concurrent.atomic.AtomicBoolean();
  /** Row layouts already dumped, keyed by the ids they contain. */
  private static final java.util.Set<String> SEEN_LAYOUTS =
    java.util.Collections.synchronizedSet(new java.util.HashSet<>());

  private static Context appCtx;

  private DialerHook() {}

  //#region install

  /** One framework may offer both entry points; the hooks must go in once. */
  private static volatile boolean installed;

  static void install(Context ctx, String pkg, ClassLoader cl, Hooks hooks) {

    synchronized (DialerHook.class) {
      if (installed) return;
      installed = true;
    }

    // Attach the file sink FIRST. Every early return below used to happen before any
    // logging existed, which made "module never loaded" indistinguishable from
    // "module loaded and bailed out".
    appCtx = ctx.getApplicationContext();
    profile = DialerProfiles.forPackage(pkg);
    RecordingIndex.attach(appCtx);
    XLog.attach(appCtx);
    XLog.i("install() in " + pkg + " (module v" + XposedEntry.MODULE_VERSION
      + ", via " + hooks.describe() + ", profile: " + profile.label + ")");

    // A real dialer holds READ_CALL_LOG. This used to be a hard gate; it is only a
    // warning now, because the scope the user picked in their Xposed manager is the
    // authoritative statement of intent, and a silent return here is unexplainable
    // from the outside.
    boolean hasCallLog = ctx.checkSelfPermission(Manifest.permission.READ_CALL_LOG)
      == PackageManager.PERMISSION_GRANTED;
    if (!hasCallLog) {
      XLog.w("this process does NOT hold READ_CALL_LOG -- probably not a dialer, or"
        + " not the default one. Continuing anyway; exact call matching will be"
        + " degraded because CallLog.Calls cannot be queried.");
    }

    RecordingIndex.Config cfg = RecordingIndex.readConfig();
    if (cfg.readOk && !cfg.enabled) {
      // Hooks still go in. Bailing out here meant the setting was read exactly once
      // per dialer launch, so turning the feature on did nothing until the dialer was
      // force-stopped -- with no indication of why. The decoration pass re-checks the
      // setting instead (cached, so it costs one provider query a minute), and returns
      // immediately while it is off.
      XLog.i("dialer integration is currently disabled in BCR-GUI settings;"
        + " hooks installed anyway, decoration will start within a minute of"
        + " enabling it");
    }
    if (!cfg.readOk) {
      // We could not reach BCR-GUI at all. Install anyway, in diagnostics mode: the
      // view hooks are what produce the dump needed to work out why.
      XLog.w("could not read config from BCR-GUI -- installing hooks in DIAGNOSTICS"
        + " mode (the play button will appear greyed out and long-pressing it dumps"
        + " the row)");
    }
    diagnosticsMode = !cfg.readOk;
    XLog.Diag.verbose = cfg.verbose || diagnosticsMode;

    // Precise path: AOSP inflates the action row from a ViewStub.
    java.lang.reflect.Method inflate = Hooks.find(ViewStub.class, "inflate");
    if (inflate != null) {
      hooks.after(inflate, (self, args, result) ->
        onViewAdded(result, result instanceof View ? ((View) result).getParent() : null));
    } else {
      XLog.w("ViewStub.inflate not found");
    }

    // Fallback path: forks that build the action row without a ViewStub.
    java.lang.reflect.Method addView = Hooks.find(ViewGroup.class, "addView",
      View.class, int.class, ViewGroup.LayoutParams.class);
    if (addView != null) {
      hooks.after(addView, (self, args, result) -> onViewAdded(args[0], self));
    } else {
      XLog.w("ViewGroup.addView not found");
    }

    installTimeTextHooks(hooks);

    // Which action button is "History" cannot be read off its slot id (they are just
    // first..fourth) nor its label (localised), but the string resource behind that
    // label keeps its name through obfuscation.
    java.lang.reflect.Method setTextRes =
      Hooks.find(TextView.class, "setText", int.class);
    if (setTextRes != null) {
      hooks.after(setTextRes, (self, args, result) -> {
        try {
          View v = (View) self;
          String name = v.getResources().getResourceEntryName((Integer) args[0]);
          if (name != null) LABEL_RESOURCES.put(v, name);
        } catch (Throwable ignored) {
          // ids without a name, or a view without resources
        }
      });
    } else {
      XLog.w("TextView.setText(int) not found");
    }

    // Google Dialer resolves the string itself and calls setText(CharSequence), so the
    // hook above never sees its action labels. Recording what each resource resolves
    // to catches it whichever way the text reaches the view -- the same approach that
    // already works for dates.
    java.lang.reflect.Method getText =
      Hooks.find("android.content.res.Resources", null, "getText", int.class);
    if (getText != null) {
      hooks.after(getText, (self, args, result) -> {
        try {
          if (!(result instanceof CharSequence)) return;
          String text = result.toString();
          if (text.length() < 2 || text.length() > 48) return;
          String name = ((android.content.res.Resources) self)
            .getResourceEntryName((Integer) args[0]);
          if (name != null) STRING_RESOURCES.put(text, name);
        } catch (Throwable ignored) {
          // ids without a name
        }
      });
    } else {
      XLog.w("Resources.getText(int) not found; history marking unavailable");
    }

    XLog.i("hooks installed; log file: " + XLog.getLogPath());
    // BCR-GUI's process may still be starting when the first rows are laid out.
    scheduleSweep(1_000);
    scheduleSweep(3_000);
    scheduleSweep(8_000);
    UI.postDelayed(DialerHook::reportSeenIds, 15_000L);
  }

  /**
   * Periodic dump of every resource id name seen so far.
   *
   * If no action row is ever matched, this is the evidence that says why: it shows
   * whether the dialer exposes the AOSP names at all, or something else entirely.
   * Stops as soon as a row is found, and gives up after a few rounds.
   */
  private static void reportSeenIds() {
    if (actionRowFound) return;
    if (++seenIdReports > 4) {
      XLog.i("no action row found; giving up on periodic id reports");
      return;
    }
    java.util.TreeSet<String> names = new java.util.TreeSet<>();
    synchronized (ID_NAMES) {
      for (int i = 0; i < ID_NAMES.size(); i++) {
        String n = ID_NAMES.valueAt(i);
        if (n != null) names.add(n);
      }
    }
    java.util.TreeSet<String> interesting = new java.util.TreeSet<>();
    for (String n : names) {
      // Anything a profile might plausibly want to name, so a dialer without one
      // still reports the handful of ids worth writing a profile against.
      if (profile.isRowRoot(n) || profile.isActionId(n) || profile.isGlyphContainer(n)
        || n.endsWith("_action") || n.endsWith("_button")
        || n.contains("call_log") || n.contains("history")) {
        interesting.add(n);
      }
    }
    XLog.i("no action row matched yet. " + names.size()
      + " distinct view ids seen.\n  candidates: " + interesting
      + "\n  all: " + names);
    UI.postDelayed(DialerHook::reportSeenIds, 30_000L);
  }

  /**
   * Remember the exact instant behind every date string the host renders.
   *
   * Reading a row's label and rebuilding a timestamp from its digits can only ever
   * recover what is displayed -- no year, no seconds -- so calls a year apart looked
   * identical. The dialer necessarily passes the real value to the platform
   * formatters, so intercepting those gives the exact instant and makes the locale,
   * the format and the missing fields all irrelevant.
   */
  private static void installTimeTextHooks(Hooks hooks) {

    Hooks.After capture = (self, args, result) -> {
      try {
        if (!(result instanceof CharSequence)) return;
        long millis = 0;
        for (Object a : args) {
          if (a instanceof Long) {
            long v = (Long) a;
            if (v > 1_000_000_000_000L) { millis = v; break; }
          } else if (a instanceof java.util.Date) {
            millis = ((java.util.Date) a).getTime();
            break;
          }
        }
        if (millis > 0) rememberTimeText((CharSequence) result, millis);
      } catch (Throwable ignored) {
        // never let bookkeeping disturb the host
      }
    };

    java.lang.reflect.Method[] formatters = {
      Hooks.find("android.text.format.DateUtils", null, "formatDateTime",
        Context.class, long.class, int.class),
      Hooks.find("android.text.format.DateUtils", null, "getRelativeTimeSpanString",
        long.class, long.class, long.class, int.class),
      Hooks.find("android.text.format.DateUtils", null, "getRelativeTimeSpanString",
        Context.class, long.class, boolean.class),
      Hooks.find("android.text.format.DateUtils", null, "getRelativeDateTimeString",
        Context.class, long.class, long.class, long.class, int.class),
      Hooks.find("java.text.DateFormat", null, "format", java.util.Date.class),
    };
    int installed = 0;
    for (java.lang.reflect.Method m : formatters) {
      if (m == null) continue;
      try {
        hooks.after(m, capture);
        installed++;
      } catch (Throwable t) {
        XLog.w("cannot hook " + m, t);
      }
    }
    XLog.i("date-formatter hooks installed: " + installed + "/" + formatters.length);
  }

  /** Rendered date string -> the instant it was rendered from. */
  private static final Map<String, Long> TIME_TEXTS =
    java.util.Collections.synchronizedMap(new LinkedHashMap<String, Long>(64, 0.75f, true) {
      @Override
      protected boolean removeEldestEntry(Map.Entry<String, Long> eldest) {
        return size() > 512;
      }
    });

  static void rememberTimeText(CharSequence text, long millis) {
    if (text == null) return;
    String k = text.toString();
    if (k.length() < 3 || k.length() > 48) return;
    Long prev = TIME_TEXTS.put(k, millis);
    // The same label can legitimately stand for two calls in the same minute, but a
    // string that maps to instants far apart is a coarse format ("hace 20 minutos")
    // and cannot identify a call. Never treat those as exact.
    if (prev != null && Math.abs(prev - millis) > 5 * 60_000L) {
      AMBIGUOUS_TIME_TEXTS.add(k);
    }
  }

  private static final java.util.Set<String> AMBIGUOUS_TIME_TEXTS =
    java.util.Collections.synchronizedSet(new java.util.HashSet<>());

  private static void onViewAdded(Object added, Object parent) {

    // Register any list we see. Everything else is driven from the list's own layout
    // pass rather than from addView: recycled rows are re-attached, not re-added, so
    // addView never fires for them, and the dialer rebuilds parts of a row on bind,
    // which silently removed views injected at add time.
    if (parent instanceof ViewGroup && isList((View) parent)) {
      registerList((ViewGroup) parent);
    }
    if (added instanceof ViewGroup && isList((View) added)) {
      registerList((ViewGroup) added);
    }
  }

  private static boolean isList(View v) {
    return v.getClass().getName().endsWith("RecyclerView")
      || v instanceof android.widget.AbsListView;
  }

  private static void registerList(final ViewGroup list) {
    if (LISTS.put(list, Boolean.TRUE) != null) return;
    XLog.i("watching list id=" + idName(list) + " (" + list.getClass().getName() + ")");

    list.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> decorateList(list));

    // A ViewTreeObserver belongs to the window, not the view, so everything registered
    // on it is lost when the list is detached -- which is exactly what happens on the
    // way to the history screen. Re-registering on each attach is what keeps scrolling
    // updates alive after coming back.
    list.addOnAttachStateChangeListener(new View.OnAttachStateChangeListener() {
      @Override
      public void onViewAttachedToWindow(View v) {
        watchScrolling(list);
        UI.post(() -> decorateList(list));
      }

      @Override
      public void onViewDetachedFromWindow(View v) { }
    });
    watchScrolling(list);

    UI.post(() -> decorateList(list));
  }

  private static void watchScrolling(final ViewGroup list) {
    try {
      list.getViewTreeObserver().addOnScrollChangedListener(() -> decorateList(list));
    } catch (Throwable t) {
      XLog.w("cannot watch scrolling on " + idName(list), t);
    }
  }

  /**
   * Decorate every list again shortly.
   *
   * Decoration is event-driven, so a row whose lookup could not be answered -- the
   * provider still starting up at dialer launch -- would simply stay bare until some
   * unrelated layout happened to run. A few delayed sweeps cover that without polling.
   */
  private static void scheduleSweep(long delayMs) {
    if (delayMs == 0 && !SWEEP_PENDING.compareAndSet(false, true)) return;
    UI.postDelayed(() -> {
      SWEEP_PENDING.set(false);
      java.util.List<ViewGroup> lists;
      synchronized (LISTS) {
        lists = new ArrayList<>(LISTS.keySet());
      }
      for (ViewGroup l : lists) {
        if (l != null && l.isAttachedToWindow()) decorateList(l);
      }
    }, delayMs);
  }

  /** Decorate every row currently attached to the list. */
  private static void decorateList(ViewGroup list) {
    // Re-checked here rather than once at startup, so switching the setting on takes
    // effect without restarting the dialer.
    if (!RecordingIndex.readConfig().enabled) return;
    pushDiagnostics(false);
    try {
      for (int i = 0; i < list.getChildCount(); i++) {
        View item = list.getChildAt(i);
        if (item instanceof ViewGroup) decorateItem((ViewGroup) item);
      }
    } catch (Throwable t) {
      XLog.e("list decoration failed", t);
    }
  }

  /**
   * Decorate one row: a badge next to the HD/wifi glyphs, and a play button in the
   * expanded action area. Both are re-checked on every pass, so a row the dialer
   * rebuilt gets its decoration back instead of losing it until it is recycled.
   */
  private static void decorateItem(ViewGroup item) {

    dumpItemOnce(item);

    ViewGroup badges = findByIds(item, profile.glyphContainers, 0);
    if (badges != null) injectIndicator(badges);

    ViewGroup history = findByIds(item, profile.historyContainers, 0);
    if (history != null && findChildById(history, profile.historyDurationId) != null) {
      injectHistoryPlay(history);
    }

    ViewGroup actions = findActionRow(item, 0);

    // Marked whether or not the row is grouped. A grouped row is exactly where this
    // matters most: its play button is suppressed on purpose, so the mark on History
    // is the only thing telling the user recordings exist behind it.
    if (actions != null) markHistoryButton(actions);

    if (actions != null && isGrouped(item)) {
      // A coalesced row stands for several calls, so one button cannot say which
      // recording it would play. The badge still marks the row; the per-call buttons
      // live on the history screen.
      View stale = findMarked(actions);
      if (stale != null) stale.setVisibility(View.GONE);
      actions = null;
    }
    if (actions != null) {
      if (!actionRowFound) {
        actionRowFound = true;
        XLog.i("action row matched: id=" + idName(actions)
          + " class=" + actions.getClass().getName());
      }
      inject(actions);
    }
  }

  /**
   * Dump each distinct row layout once.
   *
   * Keyed by the ids a row contains rather than by class, because the per-contact
   * history screen and the call log use different layouts that must both be seen, and
   * an obfuscated class name says nothing about which is which.
   */
  private static void dumpItemOnce(ViewGroup item) {
    if (rowDumps >= 10) return;
    StringBuilder sig = new StringBuilder(idName(item) == null ? "?" : idName(item));
    collectIds(item, 0, sig);
    String key = sig.toString();
    if (!SEEN_LAYOUTS.add(key)) return;
    rowDumps++;
    StringBuilder sb = new StringBuilder("row layout #" + rowDumps + ":\n");
    dumpTree(item, 0, sb);
    XLog.i(sb.toString());
  }

  private static void collectIds(ViewGroup vg, int depth, StringBuilder out) {
    if (depth > 3) return;
    for (int i = 0; i < vg.getChildCount(); i++) {
      View c = vg.getChildAt(i);
      String n = idName(c);
      if (n != null) out.append('|').append(n);
      if (c instanceof ViewGroup) collectIds((ViewGroup) c, depth + 1, out);
    }
  }

  //#endregion

  //#region action row detection

  /**
   * Find the container holding the row's action buttons: the view whose children
   * include at least one known AOSP action id, or two or more ids ending in
   * "_action" (which is what vendor forks tend to produce).
   */
  private static ViewGroup findActionRow(ViewGroup vg, int depth) {

    // Depth is measured from the list's item view: card > root layout > dropdown
    // container > action_button_container is already 3 levels on Google Dialer.
    if (depth > MAX_ROW_DEPTH) return null;

    int actionish = 0;
    boolean known = false;
    for (int i = 0; i < vg.getChildCount(); i++) {
      String name = idName(vg.getChildAt(i));
      if (name == null) continue;
      if (profile.isActionId(name)) { known = true; actionish++; }
    }
    if (known || actionish >= 2) return vg;

    for (int i = 0; i < vg.getChildCount(); i++) {
      View c = vg.getChildAt(i);
      if (c instanceof ViewGroup) {
        ViewGroup found = findActionRow((ViewGroup) c, depth + 1);
        if (found != null) return found;
      }
    }
    return null;
  }

  /**
   * Report the parent chain when a row cannot be identified.
   *
   * The likely cause is the action container living outside the RecyclerView (in an
   * expansion panel rather than the list item), in which case there is no ViewHolder
   * to reflect and the chain shows where it actually sits.
   */
  private static void logAncestors(View v) {
    if (identityFailures++ > 3) return;
    StringBuilder sb = new StringBuilder("could not identify the call; ancestor chain:\n");
    View cur = v;
    for (int i = 0; i < 15 && cur != null; i++) {
      sb.append("  ").append(cur.getClass().getName())
        .append(" id=").append(idName(cur)).append('\n');
      android.view.ViewParent p = cur.getParent();
      cur = (p instanceof View) ? (View) p : null;
      if (p != null && !(p instanceof View)) {
        sb.append("  <root: ").append(p.getClass().getName()).append(">\n");
      }
    }
    XLog.i(sb.toString());
  }

  /** First descendant (or self) whose resource name is in {@code ids}. */
  private static ViewGroup findByIds(ViewGroup vg, List<String> ids, int depth) {
    if (depth > MAX_ROW_DEPTH) return null;
    String name = idName(vg);
    if (name != null && ids.contains(name)) return vg;
    for (int i = 0; i < vg.getChildCount(); i++) {
      View c = vg.getChildAt(i);
      if (c instanceof ViewGroup) {
        ViewGroup found = findByIds((ViewGroup) c, ids, depth + 1);
        if (found != null) return found;
      }
    }
    return null;
  }

  private static ViewGroup findRowRoot(ViewGroup vg, int depth) {
    if (depth > 3) return null;
    String name = idName(vg);
    if (name != null && profile.isRowRoot(name)) return vg;
    for (int i = 0; i < vg.getChildCount(); i++) {
      View c = vg.getChildAt(i);
      if (c instanceof ViewGroup) {
        ViewGroup found = findRowRoot((ViewGroup) c, depth + 1);
        if (found != null) return found;
      }
    }
    return null;
  }

  /**
   * Dump a call-log row when its shape changes.
   *
   * The action buttons only exist once the user expands a row, so dumping at row
   * creation would show the collapsed layout only. Watching for a change in the
   * visible-descendant count catches the expanded state too.
   */
  private static void watchRowRoot(final ViewGroup rowRoot) {
    if (ROW_DUMPS.containsKey(rowRoot)) return;
    ROW_DUMPS.put(rowRoot, visibleCount(rowRoot));
    dumpRow(rowRoot, "call-log row (first seen)");
    rowRoot.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> {
      Integer prev = ROW_DUMPS.get(rowRoot);
      int now = visibleCount(rowRoot);
      if (prev != null && prev != now) {
        ROW_DUMPS.put(rowRoot, now);
        dumpRow(rowRoot, "call-log row (changed: " + prev + " -> " + now + " views)");
      }
    });
  }

  private static void dumpRow(ViewGroup rowRoot, String why) {
    if (rowDumps >= 10) return;
    rowDumps++;
    StringBuilder sb = new StringBuilder(why + ":\n");
    dumpTree(rowRoot, 0, sb);
    XLog.i(sb.toString());
  }

  private static int visibleCount(View v) {
    if (v.getVisibility() != View.VISIBLE) return 0;
    int n = 1;
    if (v instanceof ViewGroup) {
      ViewGroup vg = (ViewGroup) v;
      for (int i = 0; i < vg.getChildCount(); i++) n += visibleCount(vg.getChildAt(i));
    }
    return n;
  }

  private static String idName(View v) {
    if (v == null) return null;
    int id = v.getId();
    // NO_ID, or an id from an unnamed/aapt-generated range we cannot resolve
    if (id == View.NO_ID || (id & 0xff000000) == 0) return null;
    synchronized (ID_NAMES) {
      int idx = ID_NAMES.indexOfKey(id);
      if (idx >= 0) return ID_NAMES.valueAt(idx);
    }
    String name;
    try {
      name = v.getResources().getResourceEntryName(id);
    } catch (Throwable t) {
      name = null;
    }
    synchronized (ID_NAMES) {
      ID_NAMES.put(id, name);
    }
    return name;
  }

  //#endregion

  //#region button injection

  private static void inject(final ViewGroup row) {

    View existing = findMarked(row);
    if (existing != null) {
      // Already present: just re-evaluate. The list drives this on every layout, so a
      // row the dialer rebuilt gets decorated again rather than losing the button.
      refresh(row, existing);
      return;
    }

    // Style template: prefer a visible sibling, else any recognised action button.
    // Matching on "_action" alone missed Google Dialer entirely, whose buttons are
    // named "conversation_history_call_log_button_first" and friends.
    View template = null;
    for (int i = 0; i < row.getChildCount(); i++) {
      View c = row.getChildAt(i);
      String n = idName(c);
      if (n == null) continue;
      if (!(profile.isActionId(n))) {
        continue;
      }
      if (template == null || (c.getVisibility() == View.VISIBLE
        && template.getVisibility() != View.VISIBLE)) {
        template = c;
      }
    }
    if (template == null) {
      XLog.w("no style template found in " + idName(row) + "; using defaults");
    }

    final View button = buildButton(row, template);
    button.setLayoutParams(buildParams(row, template));
    row.addView(button);
    XLog.i("play button injected into id=" + idName(row)
      + " (" + row.getClass().getName() + "), template=" + idName(template));

    refresh(row, button);
  }

  /**
   * Small badge on the collapsed row, alongside the HD / wifi-call glyphs, so a call
   * with a recording can be spotted without expanding it.
   */
  private static void injectIndicator(final ViewGroup badges) {

    View dot = findMarked(badges, MARKER_DOT);
    int size = badgeSize(badges);

    if (dot == null && BADGED.containsKey(badges)) {
      // Confirms the container discarded it rather than this being a first visit.
      if (Diag.once("badge-readded")) {
        XLog.i("badge was removed by " + badges.getClass().getSimpleName()
          + " and is being re-added");
      }
    }

    if (dot == null) {
      BADGED.put(badges, Boolean.TRUE);
      android.widget.ImageView iv = new android.widget.ImageView(badges.getContext());
      iv.setContentDescription(MARKER_DOT);
      android.widget.LinearLayout.LayoutParams lp =
        new android.widget.LinearLayout.LayoutParams(size, size);
      float d = badges.getResources().getDisplayMetrics().density;
      lp.setMarginStart((int) (3 * d));
      // Keeps the badge visually attached to the status glyphs on its left rather
      // than to the grouped-call count that follows the container.
      lp.setMarginEnd((int) (7 * d));
      lp.gravity = android.view.Gravity.CENTER_VERTICAL;
      iv.setLayoutParams(lp);
      iv.setVisibility(View.GONE);
      iv.setImageDrawable(recordDot(secondaryTextColor(badges.getContext()), size));
      // MUST be appended, never inserted. CallLogIconContainerView addresses its
      // children by index and casts them to ImageView, so putting anything ahead of
      // them shifts the slots and crashes the dialer with a ClassCastException.
      // Separation from the grouped-call count is done with a margin instead.
      badges.addView(iv);
      dot = iv;
    } else if (dot.getLayoutParams() != null && dot.getLayoutParams().width != size) {
      // Sizing depends on the siblings having been laid out, which is not true on the
      // first pass, so it is corrected once their real bounds are known.
      dot.getLayoutParams().width = size;
      dot.getLayoutParams().height = size;
      ((android.widget.ImageView) dot).setImageDrawable(
        recordDot(secondaryTextColor(badges.getContext()), size));
      dot.requestLayout();
    }

    refresh(badges, dot);
  }

  /**
   * Size the badge from the glyphs it sits next to.
   *
   * Deriving it from text size overshot: these siblings are icon glyphs whose drawn
   * height is well below their font size, so the dot came out visibly larger than the
   * HD and wifi-call marks beside it.
   */
  private static int badgeSize(ViewGroup badges) {
    float density = badges.getResources().getDisplayMetrics().density;
    int sibling = 0;
    for (int i = 0; i < badges.getChildCount(); i++) {
      View c = badges.getChildAt(i);
      if (MARKER_DOT.contentEquals(c.getContentDescription() == null
        ? "" : c.getContentDescription())) {
        continue;
      }
      sibling = Math.max(sibling, c.getHeight());
    }
    if (sibling <= 0) return (int) (8 * density);
    int size = (int) (sibling * 0.5f);
    return Math.max((int) (6 * density), Math.min(size, (int) (12 * density)));
  }

  /**
   * Play control for a per-contact history entry.
   *
   * swipeableContainer is a RelativeLayout holding the direction icon, the text block
   * and the duration. The button is anchored just before the duration, in the gap that
   * layout already leaves, so nothing existing has to move and no constraint or chain
   * is disturbed.
   */
  private static void injectHistoryPlay(final ViewGroup container) {

    View existing = findMarked(container, MARKER);
    if (existing != null) {
      placeHistoryPlay(container, existing);
      refresh(container, existing);
      return;
    }

    View anchor = findChildById(container, profile.historyDurationId);
    Context ctx = container.getContext();
    float density = ctx.getResources().getDisplayMetrics().density;
    int size = (int) (44 * density);

    int tint = anchor instanceof TextView
      ? ((TextView) anchor).getCurrentTextColor() : secondaryTextColor(ctx);

    android.widget.ImageView btn = new android.widget.ImageView(ctx);
    btn.setContentDescription(MARKER);
    btn.setImageDrawable(playIcon(tint, (int) (24 * density)));
    btn.setScaleType(android.widget.ImageView.ScaleType.CENTER);
    android.util.TypedValue attr = new android.util.TypedValue();
    if (ctx.getTheme().resolveAttribute(
      android.R.attr.selectableItemBackgroundBorderless, attr, true)) {
      btn.setBackgroundResource(attr.resourceId);
    }

    btn.setLayoutParams(new android.widget.RelativeLayout.LayoutParams(size, size));
    btn.setVisibility(View.GONE);
    btn.setClickable(true);
    btn.setFocusable(true);

    btn.setOnClickListener(v -> {
      RecordingIndex.Match m = (RecordingIndex.Match) v.getTag();
      if (m != null && m.playUri != null) {
        MiniPlayer.show(v.getContext(), Uri.parse(m.playUri), m.name, m.date, RecordingIndex.readConfig());
      }
    });
    btn.setOnLongClickListener(v -> {
      dumpDiagnostics(v);
      return true;
    });

    container.addView(btn);
    placeHistoryPlay(container, btn);
    XLog.i("history play button injected into " + idName(container)
      + " anchored to " + idName(anchor));
    refresh(container, btn);
  }

  /**
   * Position the history play button, re-evaluated on every pass.
   *
   * Missed calls carry no duration, so anchoring to call_duration unconditionally
   * left the button pinned at the far left of those rows, on top of the direction
   * icon. When the duration is not actually on screen, fall back to the row's end.
   */
  private static void placeHistoryPlay(ViewGroup container, View btn) {

    android.widget.RelativeLayout.LayoutParams lp =
      (android.widget.RelativeLayout.LayoutParams) btn.getLayoutParams();
    if (lp == null || HISTORY_PLACED.containsKey(btn)) return;

    // Fixed to the row's bottom-right corner rather than anchored before the
    // duration. Anchoring to the duration made the button's x depend on how wide
    // that text happened to be -- "23 s" against "1 min 27 s" -- so it sat at a
    // different position on every row. The bottom-right corner is free on all of
    // them, so the column stays straight.
    float density = container.getResources().getDisplayMetrics().density;
    lp.addRule(android.widget.RelativeLayout.ALIGN_PARENT_END);
    lp.addRule(android.widget.RelativeLayout.ALIGN_PARENT_BOTTOM);
    lp.setMarginEnd((int) (8 * density));
    lp.bottomMargin = (int) (4 * density);

    HISTORY_PLACED.put(btn, Boolean.TRUE);
    btn.requestLayout();
  }

  /**
   * True when the row stands for several coalesced calls. Google Dialer reuses
   * missed_call_count for the group size -- "(3)" in the screenshot -- so a visible,
   * non-empty one marks a grouped row.
   */
  private static boolean isGrouped(ViewGroup item) {
    if (profile.groupCountId.isEmpty()) return false;
    View count = findByIdDeep(item, profile.groupCountId, 0);
    if (!(count instanceof TextView) || count.getVisibility() != View.VISIBLE) return false;
    CharSequence t = ((TextView) count).getText();
    return t != null && t.length() > 0;
  }

  private static View findByIdDeep(ViewGroup vg, String id, int depth) {
    if (depth > MAX_ROW_DEPTH) return null;
    for (int i = 0; i < vg.getChildCount(); i++) {
      View c = vg.getChildAt(i);
      if (id.equals(idName(c))) return c;
      if (c instanceof ViewGroup) {
        View found = findByIdDeep((ViewGroup) c, id, depth + 1);
        if (found != null) return found;
      }
    }
    return null;
  }

  private static View findChildById(ViewGroup vg, String id) {
    if (vg == null) return null;
    for (int i = 0; i < vg.getChildCount(); i++) {
      if (id.equals(idName(vg.getChildAt(i)))) return vg.getChildAt(i);
    }
    return null;
  }

  /** The universal record glyph: a filled dot. */
  private static android.graphics.drawable.Drawable recordDot(int color, int size) {
    android.graphics.drawable.ShapeDrawable d = new android.graphics.drawable.ShapeDrawable(
      new android.graphics.drawable.shapes.OvalShape());
    d.getPaint().setColor(color);
    d.getPaint().setAntiAlias(true);
    d.setIntrinsicWidth(size);
    d.setIntrinsicHeight(size);
    d.setBounds(0, 0, size, size);
    return d;
  }

  private static int secondaryTextColor(Context ctx) {
    android.util.TypedValue tv = new android.util.TypedValue();
    if (ctx.getTheme().resolveAttribute(android.R.attr.textColorSecondary, tv, true)) {
      if (tv.resourceId != 0) {
        try {
          return ctx.getColor(tv.resourceId);
        } catch (Throwable ignored) {
          // colour state list without a plain colour; fall through
        }
      }
      if (tv.data != 0) return tv.data;
    }
    return 0xFF5F6368;
  }

  /**
   * Dot the "History" action when the contact has recordings on other calls.
   *
   * A call with no recording of its own says nothing about the rest of the contact's
   * history, so without this the only way to find out is to open it and look.
   */
  private static void markHistoryButton(final ViewGroup row) {

    final View history = findHistoryButton(row);
    if (history == null) return;

    CallIdentity raw = resolveRaw(row);
    if (raw == null || TextUtils.isEmpty(raw.number)) return;
    final String number = raw.number;

    Boolean known = CONTACT_HAS_ANY.get(number);
    if (known != null) {
      applyHistoryMark(history, known);
      return;
    }
    synchronized (IN_FLIGHT) {
      if (IN_FLIGHT.containsKey(history)) return;
      IN_FLIGHT.put(history, Boolean.TRUE);
    }
    WORKER.execute(() -> {
      Boolean any = contactHasRecordings(number);
      if (any != null) CONTACT_HAS_ANY.put(number, any);
      UI.post(() -> {
        synchronized (IN_FLIGHT) {
          IN_FLIGHT.remove(history);
        }
        if (any != null) applyHistoryMark(history, any);
      });
    });
  }

  /** @return TRUE, FALSE, or null when the provider could not answer. */
  private static Boolean contactHasRecordings(String number) {
    if (appCtx == null) return null;
    try (Cursor c = appCtx.getContentResolver().query(
      DialerLink.lookupUri(number, 0), null, null, null, null)) {
      boolean any = c != null && c.moveToFirst();
      String line = "contact has recordings " + Diag.mask(number) + ": " + any;
      if (Diag.once(line)) XLog.i(line);
      return any;
    } catch (Throwable t) {
      XLog.w("contact lookup failed", t);
      return null;   // unknown, so nothing is remembered and it is asked again
    }
  }

  /**
   * The dot goes on the label's trailing edge as a compound drawable, so the button's
   * own leading icon, background and text stay exactly as the dialer set them.
   */
  private static void applyHistoryMark(View history, boolean has) {
    if (!(history instanceof TextView)) return;
    TextView tv = (TextView) history;
    android.graphics.drawable.Drawable[] current = tv.getCompoundDrawablesRelative();

    // Whether the dot is there is read off the button, not remembered. Caching it
    // meant that when the dialer rebuilt the button on the way back from the history
    // screen -- dropping the drawable -- the cache still said "marked" and it was
    // never restored. The dot is the only ShapeDrawable these buttons carry.
    boolean marked = current[2] instanceof android.graphics.drawable.ShapeDrawable;
    if (has == marked) return;

    int size = (int) Math.max(tv.getTextSize() * 0.45f, 1f);
    tv.setCompoundDrawablesRelative(current[0], current[1],
      has ? recordDot(tv.getCurrentTextColor(), size) : null, current[3]);
  }

  /** The action button whose label came from a resource named for history. */
  private static View findHistoryButton(ViewGroup row) {
    if (Diag.once("action-labels")) {
      StringBuilder all = new StringBuilder();
      for (int i = 0; i < row.getChildCount(); i++) {
        all.append(idName(row.getChildAt(i))).append('=')
          .append(resourceNameOf(row.getChildAt(i))).append(' ');
      }
      XLog.i("action label resources: " + all);
    }
    for (int i = 0; i < row.getChildCount(); i++) {
      View c = row.getChildAt(i);
      if (profile.isHistoryAction(resourceNameOf(c))) return c;
    }
    // Report what was on offer, once, so an unrecognised naming scheme shows up
    // instead of the feature silently doing nothing.
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < row.getChildCount(); i++) {
      sb.append(idName(row.getChildAt(i))).append('=')
        .append(resourceNameOf(row.getChildAt(i))).append(' ');
    }
    String line = "no history button among: " + sb;
    if (Diag.once(line)) XLog.i(line);
    return null;
  }


  /** Resource name behind a view's label, from either capture route. */
  private static String resourceNameOf(View v) {
    String direct = LABEL_RESOURCES.get(v);
    if (direct != null) return direct;
    if (!(v instanceof TextView)) return null;
    CharSequence text = ((TextView) v).getText();
    return text == null ? null : STRING_RESOURCES.get(text.toString());
  }

  private static View findMarked(ViewGroup row) {
    return findMarked(row, MARKER);
  }

  private static View findMarked(ViewGroup row, String marker) {
    for (int i = 0; i < row.getChildCount(); i++) {
      View c = row.getChildAt(i);
      CharSequence d = c.getContentDescription();
      if (d != null && marker.contentEquals(d)) return c;
    }
    return null;
  }

  /**
   * Build a button that matches the dialer's own action buttons.
   *
   * The right way to look native is to instantiate the dialer's *own* button class, so
   * it picks up shape, insets, ripple and text appearance from the theme exactly as
   * its siblings do. Copying a MaterialButton's background onto a plain TextView --
   * which is what this used to do -- drags a MaterialShapeDrawable onto a view with
   * none of the insets that go with it, and draws a stray box.
   *
   * Material's own setters (setIcon, setIconTint, ...) are useless here: the bundled
   * Material library is obfuscated in Google Dialer, so those names do not survive.
   * Everything below is therefore done through framework TextView APIs, which do.
   */
  private static View buildButton(ViewGroup row, View template) {

    Context ctx = row.getContext();

    // A plain TextView on purpose. Instantiating the dialer's MaterialButton looked
    // like the way to inherit its style, but its setBackgroundTintList() override
    // routes into its own helper instead of clearing View's tint, so any background
    // we set kept being repainted -- blue at first, then white. A TextView has no
    // such overrides, and since the fill is rebuilt from a sampled colour rather than
    // copied from a MaterialShapeDrawable, none of the shape mismatch that made the
    // very first version draw a stray box applies either.
    TextView tv = new TextView(ctx);
    tv.setContentDescription(MARKER);
    tv.setText(RecordingIndex.readConfig().playLabel);
    tv.setSingleLine(true);

    int iconSize = (int) (24 * ctx.getResources().getDisplayMetrics().density);

    if (template instanceof TextView) {
      TextView src = (TextView) template;
      tv.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, src.getTextSize());
      tv.setTypeface(src.getTypeface());
      tv.setTextColor(src.getTextColors());
      tv.setAllCaps(src.isAllCaps());
      tv.setGravity(src.getGravity());
      tv.setTextAlignment(src.getTextAlignment());
      tv.setPaddingRelative(src.getPaddingStart(), src.getPaddingTop(),
        src.getPaddingEnd(), src.getPaddingBottom());
      tv.setMinHeight(src.getMinHeight());
      tv.setMinimumHeight(src.getMinimumHeight());
      tv.setCompoundDrawablePadding(src.getCompoundDrawablePadding());

      // MaterialButton draws its icon as a compound drawable, so the sibling's own
      // icon is the exact reference for size -- guessing from text size made ours
      // visibly larger and pushed it out of line with the others.
      android.graphics.drawable.Drawable[] compound = src.getCompoundDrawablesRelative();
      if (compound[0] != null && compound[0].getBounds().width() > 0) {
        iconSize = compound[0].getBounds().width();
      }
      STYLE_SOURCE.put(tv, src);
    } else {
      int pad = (int) (12 * ctx.getResources().getDisplayMetrics().density);
      tv.setPadding(pad, pad, pad, pad);
      tv.setGravity(android.view.Gravity.CENTER_VERTICAL);
    }

    tv.setCompoundDrawablesRelative(
      playIcon(tv.getCurrentTextColor(), iconSize), null, null, null);
    if (tv.getCompoundDrawablePadding() <= 0) {
      tv.setCompoundDrawablePadding(
        (int) (8 * ctx.getResources().getDisplayMetrics().density));
    }

    tv.setClickable(true);
    tv.setFocusable(true);
    // shown once a recording is confirmed (or always, in diagnostics mode)
    tv.setVisibility(diagnosticsMode ? View.VISIBLE : View.GONE);

    tv.setOnClickListener(v -> {
      RecordingIndex.Match m = (RecordingIndex.Match) v.getTag();
      if (m != null && m.playUri != null) {
        MiniPlayer.show(v.getContext(), Uri.parse(m.playUri), m.name, m.date, RecordingIndex.readConfig());
      }
    });
    tv.setOnLongClickListener(v -> {
      dumpDiagnostics(v);
      return true;
    });

    return tv;
  }

  /**
   * Call the button's own icon setter.
   *
   * MaterialButton.setIcon(Drawable) cannot be looked up by name -- the bundled
   * Material library is obfuscated -- so it is identified by signature instead: a void
   * method taking exactly one Drawable, declared on the button's own class rather than
   * inherited from View/TextView (which is what excludes setBackground/setForeground).
   */
  private static boolean setIconLikeSibling(TextView button, android.graphics.drawable.Drawable icon) {
    for (Class<?> c = button.getClass(); c != null && c != TextView.class; c = c.getSuperclass()) {
      String cn = c.getName();
      if (cn.startsWith("android.widget.") || cn.startsWith("android.view.")) break;
      for (Method m : c.getDeclaredMethods()) {
        if (m.getReturnType() != void.class) continue;
        Class<?>[] ps = m.getParameterTypes();
        if (ps.length != 1
          || !android.graphics.drawable.Drawable.class.isAssignableFrom(ps[0])) {
          continue;
        }
        try {
          m.setAccessible(true);
          m.invoke(button, icon);
          if (iconSetterLogged++ < 1) {
            XLog.i("icon set via " + c.getSimpleName() + "." + m.getName() + "(Drawable)");
          }
          return true;
        } catch (Throwable ignored) {
          // wrong candidate, keep looking
        }
      }
    }
    return false;
  }

  /**
   * A plain filled triangle, drawn rather than shipped.
   *
   * android.R.drawable.ic_media_play is the 2011 platform asset and looks nothing like
   * a modern dialer; the module cannot reference BCR-GUI's own resources because it
   * runs in the dialer's process, so the icon is built here and tinted to whatever the
   * sibling buttons use for text.
   */
  private static android.graphics.drawable.Drawable playIcon(int color, int size) {
    // Inset inside its box. A Material glyph does not fill its 24dp bounds -- roughly
    // the middle 60% is ink -- so a full-bleed triangle at the same box size reads
    // noticeably heavier than the icons beside it.
    android.graphics.Path path = new android.graphics.Path();
    path.moveTo(26f, 16f);
    path.lineTo(82f, 50f);
    path.lineTo(26f, 84f);
    path.close();
    android.graphics.drawable.ShapeDrawable d = new android.graphics.drawable.ShapeDrawable(
      new android.graphics.drawable.shapes.PathShape(path, 100f, 100f));
    d.getPaint().setColor(color);
    d.getPaint().setAntiAlias(true);
    d.setIntrinsicWidth(size);
    d.setIntrinsicHeight(size);
    d.setBounds(0, 0, size, size);
    return d;
  }

  /**
   * LayoutParams for the injected button, chosen by container type.
   *
   * ConstraintLayout is the case that matters: a child added without constraints is
   * laid out at 0,0, on top of the row. Rather than splice into whatever chain the
   * dialer built between its existing buttons -- which would break it -- the button
   * is anchored on its own line below the template, which leaves every existing
   * constraint untouched.
   */
  private static ViewGroup.LayoutParams buildParams(ViewGroup container, View template) {

    if (isConstraintLayout(container) && template != null && template.getId() != View.NO_ID) {
      try {
        java.lang.reflect.Method gen = null;
        for (Class<?> c = container.getClass(); c != null; c = c.getSuperclass()) {
          try {
            gen = c.getDeclaredMethod("generateDefaultLayoutParams");
            break;
          } catch (NoSuchMethodException ignored) {
            // keep walking up
          }
        }
        if (gen != null) {
          gen.setAccessible(true);
          ViewGroup.LayoutParams lp = (ViewGroup.LayoutParams) gen.invoke(container);
          lp.width = ViewGroup.LayoutParams.WRAP_CONTENT;
          lp.height = ViewGroup.LayoutParams.WRAP_CONTENT;
          Class<?> lpc = lp.getClass();
          setInt(lpc, lp, "topToBottom", template.getId());
          setInt(lpc, lp, "startToStart", 0);   // ConstraintLayout.LayoutParams.PARENT_ID
          setInt(lpc, lp, "leftToLeft", 0);     // pre-RTL alias, same anchor
          if (lp instanceof ViewGroup.MarginLayoutParams) {
            int m = (int) (8 * container.getResources().getDisplayMetrics().density);
            ((ViewGroup.MarginLayoutParams) lp).topMargin = m;
            ((ViewGroup.MarginLayoutParams) lp).leftMargin = m;
          }
          XLog.i("constraint-anchored the play button below id=" + idName(template));
          return lp;
        }
      } catch (Throwable t) {
        XLog.w("cannot build ConstraintLayout params, falling back", t);
      }
    }

    // Everything else (LinearLayout, FrameLayout, chip rows): match the sibling, so
    // weights and margins behave the same.
    if (template != null && template.getLayoutParams() != null) {
      ViewGroup.LayoutParams src = template.getLayoutParams();
      try {
        return (ViewGroup.LayoutParams) src.getClass()
          .getConstructor(ViewGroup.LayoutParams.class).newInstance(src);
      } catch (Throwable ignored) {
        // no copy constructor on this LayoutParams subclass
      }
      try {
        return (ViewGroup.LayoutParams) src.getClass()
          .getConstructor(int.class, int.class).newInstance(src.width, src.height);
      } catch (Throwable ignored) {
        // fall through to the generic pair
      }
    }
    return new ViewGroup.LayoutParams(
      ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
  }

  private static boolean isConstraintLayout(View v) {
    for (Class<?> c = v.getClass(); c != null; c = c.getSuperclass()) {
      if (c.getName().endsWith("ConstraintLayout")) return true;
    }
    return false;
  }

  private static void setInt(Class<?> cls, Object target, String field, int value) {
    for (Class<?> c = cls; c != null; c = c.getSuperclass()) {
      try {
        java.lang.reflect.Field f = c.getDeclaredField(field);
        f.setAccessible(true);
        f.setInt(target, value);
        return;
      } catch (NoSuchFieldException ignored) {
        // not on this class, keep walking up
      } catch (Throwable t) {
        return;
      }
    }
  }

  /** Re-resolve which call this (possibly recycled) row shows, then show/hide. */
  private static void refresh(final ViewGroup row, final View target) {

    final CallIdentity raw = resolveRaw(row);
    if (raw == null) {
      logAncestors(row);
      BOUND_KEYS.remove(target);
      apply(target, null);
      return;
    }
    if (Diag.budget("id:" + idName(row), 40)) {
      XLog.i("row identity [" + idName(row) + "]: number=" + Diag.mask(raw.number)
        + " date=" + raw.date
        + " callIds=" + (raw.callIds == null ? "-" : raw.callIds.length)
        + " holder=" + (lastHolder == null ? "-" : lastHolder.getClass().getName()));
    }

    // The history screen resolves every row to the same call, so dump its model once.
    if (profile.isHistoryContainer(idName(row)) && Diag.budget("holder:history", 1)) {
      dumpHolderGraph(lastHolder);
    }

    // Without a timestamp we can only identify the contact, not the call. On the
    // history screen that would put a button on every entry and imply they all have
    // recordings, so show nothing rather than something wrong.
    if (raw.date == 0 && raw.durationSec <= 0 && !raw.hasRowTime()
      && profile.isHistoryContainer(idName(row))) {
      BOUND_KEYS.remove(target);
      if (Diag.budget("history-nodate", 3)) {
        XLog.w("history row has no timestamp; hiding its play button");
      }
      apply(target, null);
      return;
    }

    if (raw.date > 0) {
      String line = "row resolved [" + idName(row) + "] \"" + Diag.maskLetters(fingerprint(row))
        + "\" -> " + new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss",
            java.util.Locale.US).format(new java.util.Date(raw.date));
      if (Diag.once(line)) XLog.i(line);
    }

    noteDateUse(raw);

    final String key = raw.cacheKey();

    // Clear first if this control is still carrying another row's answer. The list
    // recycles these views, so a button left visible from a previous binding stays on
    // screen -- and stays clickable -- over a call it has nothing to do with. That is
    // what put a play button on a row with no recording and played an unrelated call.
    String held = BOUND_KEYS.get(target);
    if (held != null && !held.equals(key)) apply(target, null);

    RecordingIndex.Match cached;
    synchronized (MATCHES) {
      cached = MATCHES.get(key);
    }
    if (cached != null) {
      // Always applied, never skipped. Returning early here without touching
      // visibility is what made the badge flicker while scrolling: a recycled row
      // kept whatever the previous row had shown.
      BOUND_KEYS.put(target, key);
      apply(target, cached);
      return;
    }

    // Nothing known yet for this call: hide rather than leave the previous row's
    // answer on screen, then resolve in the background.
    apply(target, null);

    synchronized (IN_FLIGHT) {
      if (IN_FLIGHT.containsKey(target)) return;
      IN_FLIGHT.put(target, Boolean.TRUE);
    }
    WORKER.execute(() -> {
      final RecordingIndex.Match m = RecordingIndex.doLookup(raw);
      // A failure is not a "no". Caching one meant a provider still warming up at
      // dialer start -- loading its database, listing the directory -- turned into a
      // permanent absence of badges until the process was restarted.
      if (!m.failed) {
        synchronized (MATCHES) {
          MATCHES.put(key, m);
        }
      } else if (RETRIES.incrementAndGet() <= 12) {
        scheduleSweep(1_500);
      }
      UI.post(() -> {
        synchronized (IN_FLIGHT) {
          IN_FLIGHT.remove(target);
        }
        // The host rebuilds parts of a row while the lookup is in flight -- the icon
        // container discards and re-adds its children on bind -- so by now this
        // control may be detached. Applying to it would be invisible, and the answer
        // would sit in the cache with nothing on screen to show it.
        if (target.getParent() == null) {
          if (Diag.once("detached-control")) {
            XLog.i("control was removed while its lookup ran; re-decorating");
          }
          scheduleSweep(0);
          return;
        }
        CallIdentity current = resolveRaw(row);
        if (current != null && key.equals(current.cacheKey())) {
          BOUND_KEYS.put(target, key);
          apply(target, m);
        }
        // Other rows may have been rebuilt meanwhile and are now answerable from the
        // cache, so give them a pass rather than waiting for an unrelated event.
        scheduleSweep(0);
      });
    });
  }

  /**
   * Spot a scanned "timestamp" that is really a constant.
   *
   * The model walk selects longs by shape, and the dialer holds at least one fixed
   * epoch-looking value that it can reach before the call's own. Cached as a field
   * path, that value is then replayed for every row: they all resolve to the same
   * fake instant, match nothing, and the miss is cached. A genuine call time cannot
   * belong to several different numbers, so that is the test.
   */
  private static void noteDateUse(CallIdentity raw) {
    if (raw.date == 0 || TextUtils.isEmpty(raw.number)) return;
    Long when = raw.date;
    boolean promoted = false;
    synchronized (DATE_USERS) {
      java.util.Set<String> users = DATE_USERS.get(when);
      if (users == null) {
        if (DATE_USERS.size() > 256) DATE_USERS.clear();
        users = new java.util.HashSet<>(2);
        DATE_USERS.put(when, users);
      }
      users.add(raw.number);
      if (users.size() >= 3 && BAD_DATES.add(when)) promoted = true;
    }
    if (!promoted) return;

    XLog.w("discarding " + when + " as a call time: " + DATE_USERS.get(when).size()
      + " different numbers share it");

    // Everything derived from it has to go: the cached path that produced it, the
    // identities built on it, and the misses recorded against it.
    synchronized (PATHS) {
      PATHS.clear();
    }
    NO_DATE.clear();
    synchronized (IDENTITY_MEMO) {
      IDENTITY_MEMO.clear();
    }
    synchronized (MATCHES) {
      java.util.Iterator<Map.Entry<String, RecordingIndex.Match>> it = MATCHES.entrySet().iterator();
      while (it.hasNext()) {
        if (it.next().getKey().endsWith("|" + when)) it.remove();
      }
    }
    scheduleSweep(0);
  }

  /** Epoch values seen against more than one number, so not per-call times. */
  private static final java.util.Set<Long> BAD_DATES =
    java.util.Collections.synchronizedSet(new java.util.HashSet<>());

  private static final Map<Long, java.util.Set<String>> DATE_USERS =
    new java.util.HashMap<>();

  private static void apply(View target, RecordingIndex.Match m) {
    RecordingIndex.Match previous = target.getTag() instanceof RecordingIndex.Match ? (RecordingIndex.Match) target.getTag() : null;
    target.setTag(m);
    boolean playable = m != null && m.playUri != null;

    // Report the pairing itself, once per row/recording combination: which row text
    // ended up bound to which recording. Inferring this from separate identity and
    // lookup lines has repeatedly been inconclusive.
    if (playable && (previous == null || !m.playUri.equals(previous.playUri))) {
      View row = target.getParent() instanceof View ? (View) target.getParent() : target;
      String label = fingerprint(row);
      if (label != null && label.length() > 80) label = label.substring(0, 80);
      String line = "BOUND \"" + Diag.maskLetters(label) + "\" -> "
        + new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.US)
            .format(new java.util.Date(m.date))
        + " " + m.playUri.substring(m.playUri.lastIndexOf('/') + 1);
      if (Diag.once(line)) XLog.i(line);
    }
    // In diagnostics mode the button stays on screen even with nothing to play: it is
    // the only handle the user has for triggering the long-press dump.
    target.setVisibility(playable || diagnosticsMode ? View.VISIBLE : View.GONE);
    target.setAlpha(playable ? 1f : 0.4f);
    if (playable) styleFromSibling(target);
  }

  /**
   * RecordingIndex.Match the sibling buttons' fill, once.
   *
   * Copying their background Drawable did not work: a MaterialButton's fill comes from
   * a tint held by its helper, and a copy made through getConstantState() loses it --
   * which is why the button rendered white with a stray outline. Sampling the colour
   * the sibling actually draws sidesteps the whole problem, and is immune to the
   * Material library being obfuscated.
   */
  private static void styleFromSibling(View target) {

    if (STYLED.containsKey(target)) return;
    View template = (View) STYLE_SOURCE.get(target);
    // The stored sibling may still be GONE: the dialer fills its four action slots
    // after the row is built, so pick whichever one is actually on screen now.
    if (template == null || template.getWidth() <= 0 || template.getHeight() <= 0) {
      template = visibleSibling(target);
    }
    if (template == null || template.getWidth() <= 0 || template.getHeight() <= 0) return;

    try {
      int fill = sampleBackgroundColor(template);
      if (android.graphics.Color.alpha(fill) < 8) return; // nothing drawn yet, retry later
      STYLED.put(target, Boolean.TRUE);

      float radius = cornerRadius(template);
      android.graphics.drawable.GradientDrawable shape =
        new android.graphics.drawable.GradientDrawable();
      shape.setShape(android.graphics.drawable.GradientDrawable.RECTANGLE);
      shape.setCornerRadius(radius);
      shape.setColor(fill);

      android.util.TypedValue tv = new android.util.TypedValue();
      android.graphics.drawable.Drawable bg = shape;
      if (target.getContext().getTheme()
        .resolveAttribute(android.R.attr.colorControlHighlight, tv, true)) {
        bg = new android.graphics.drawable.RippleDrawable(
          android.content.res.ColorStateList.valueOf(tv.data), shape, null);
      }
      target.setBackgroundTintList(null);
      target.setBackground(bg);
      XLog.i("play button styled from sibling: fill=#" + Integer.toHexString(fill)
        + " radius=" + radius);
    } catch (Throwable t) {
      XLog.w("cannot style the play button from its sibling", t);
    }
  }

  /** A laid-out action sibling of the injected button, if any. */
  private static View visibleSibling(View target) {
    if (!(target.getParent() instanceof ViewGroup)) return null;
    ViewGroup parent = (ViewGroup) target.getParent();
    for (int i = 0; i < parent.getChildCount(); i++) {
      View c = parent.getChildAt(i);
      if (c == target) continue;
      String n = idName(c);
      if (n == null) continue;
      if (!(profile.isActionId(n))) {
        continue;
      }
      if (c.getVisibility() == View.VISIBLE && c.getWidth() > 0) return c;
    }
    return null;
  }

  /**
   * Read the colour the sibling actually paints.
   *
   * The sibling itself is rendered, not a copy of its background: a MaterialButton
   * keeps its fill in a tint held outside the drawable's constant state, so a copy
   * comes out untinted. Only an 8x8 window near the sibling's trailing edge is drawn
   * -- past its label, so the sample is background rather than text.
   */
  private static int sampleBackgroundColor(View v) {
    if (v.getWidth() < 12 || v.getHeight() < 4) return 0;
    android.graphics.Bitmap bmp =
      android.graphics.Bitmap.createBitmap(8, 8, android.graphics.Bitmap.Config.ARGB_8888);
    try {
      android.graphics.Canvas c = new android.graphics.Canvas(bmp);
      c.translate(-(v.getWidth() - 10), -(v.getHeight() / 2f - 4));
      v.draw(c);
      return bmp.getPixel(4, 4);
    } catch (Throwable t) {
      XLog.w("cannot sample the sibling's colour", t);
      return 0;
    } finally {
      bmp.recycle();
    }
  }

  /** Corner radius the sibling clips to, so the injected button has the same shape. */
  private static float cornerRadius(View v) {
    try {
      if (v.getOutlineProvider() != null) {
        android.graphics.Outline o = new android.graphics.Outline();
        v.getOutlineProvider().getOutline(v, o);
        float r = o.getRadius();
        if (r > 0) return r;
      }
    } catch (Throwable ignored) {
      // provider that cannot describe itself; fall back below
    }
    return v.getHeight() > 0 ? v.getHeight() / 3.5f
      : 16 * v.getResources().getDisplayMetrics().density;
  }

  //#endregion

  //#region call identity


  /**
   * Reflect the row's ViewHolder for whatever identifies the call. Field *names* are
   * obfuscated in Google Dialer, so fields are selected by type and by value shape:
   * a long[] of call-log row ids, a phone-number-looking String, an epoch-ms long.
   */
  private static CallIdentity resolveRaw(View anyViewInRow) {

    View item = anyViewInRow;
    ViewGroup list = null;
    for (int i = 0; i < 12 && item.getParent() instanceof ViewGroup; i++) {
      ViewGroup parent = (ViewGroup) item.getParent();
      String cn = parent.getClass().getName();
      if (cn.endsWith("RecyclerView") || parent instanceof android.widget.AbsListView) {
        list = parent;
        break;
      }
      item = parent;
    }
    if (list == null) return null;

    Object holder = findViewHolder(list, item);

    lastHolder = holder;
    scanTopic = holder == null ? "?" : holder.getClass().getName();

    // Reuse the last answer for this holder while the row still shows the same thing.
    // Path caching alone could not carry this: parent links are not recorded through
    // collections, so a number reached via one is never cacheable and the full walk
    // repeated for every row on every frame.
    String print = fingerprint(item);
    if (holder != null && print != null) {
      Object[] memo = IDENTITY_MEMO.get(holder);
      if (memo != null && print.equals(memo[0])) return (CallIdentity) memo[1];
    }

    CallIdentity id = new CallIdentity();
    if (holder != null) scanGraph(holder, id);

    // Even with no holder there is a way in: a RecyclerView child's LayoutParams keeps
    // a reference to its ViewHolder, so the model is reachable from there without
    // naming a single method or field.
    ViewGroup.LayoutParams lp = item.getLayoutParams();
    if (lp != null && id.callIds == null && TextUtils.isEmpty(id.number)) {
      scanGraph(lp, id);
    }
    if (id.callIds == null && TextUtils.isEmpty(id.number)) {
      id.number = scrapeNumber(item);
    }
    if (id.callIds == null && TextUtils.isEmpty(id.number)) {
      dumpHolderGraph(holder != null ? holder : lp);
      return null;
    }
    // Decided from the row itself, never from which container asked. Keying this on
    // the caller meant the badge (which asks via first_line_icon_container) skipped
    // the override and memoised an identity carrying the bogus date, which the play
    // button then read back from the memo for the same holder.
    if (item instanceof ViewGroup
      && findByIdDeep((ViewGroup) item, profile.historyDurationId, 0) != null) {
      // The history holder has no per-call timestamp: what the walk turned up was a
      // constant (the same Feb-2022 value on every row) and a long[] that is not
      // call-log ids. Both are worse than nothing, because they look like an answer.
      // The row does display the call's length, and BCR-GUI knows each recording's,
      // so that is what pairs a row with a recording here.
      id.date = 0;
      id.callIds = null;
      id.durationSec = readDurationSeconds(anyViewInRow);
      readRowTime(item, id);
    }

    if (holder != null && print != null) {
      IDENTITY_MEMO.put(holder, new Object[]{ print, id });
    }
    return id;
  }

  /**
   * Breadth-first scan of the view holder's object graph.
   *
   * A single level is not enough: Google Dialer's holder keeps the call in a nested
   * model object (a protobuf row) whose number is itself wrapped in another message,
   * so nothing phone-shaped exists at the top level. Fields are still selected by type
   * and value shape rather than name, since names are obfuscated. Breadth-first means
   * the shallowest -- and so least surprising -- candidate wins.
   */
  /**
   * Locate the row's ViewHolder.
   *
   * getChildViewHolder() is the obvious route and the one that fails here: Google
   * Dialer bundles the old support-library RecyclerView, whose class name survives R8
   * (it is named in XML) while its methods are renamed, so the method cannot be found
   * by name. The fallbacks therefore work by type, which R8 does not change.
   */
  private static Object findViewHolder(ViewGroup list, View item) {

    // 1. unobfuscated dialers: the public API, by name
    try {
      Method m = list.getClass().getMethod("getChildViewHolder", View.class);
      Object h = m.invoke(list, item);
      if (h != null) {
        if (holderPathLogged++ < 1) XLog.i("view holder via getChildViewHolder: "
          + h.getClass().getName());
        return h;
      }
    } catch (Throwable ignored) {
      // renamed or absent, try by type
    }

    // 2. RecyclerView.LayoutParams keeps its ViewHolder: find the field by value type.
    //    The field is cached per LayoutParams class -- this runs for every row on
    //    every frame while scrolling, and re-walking the class each time is wasted.
    try {
      ViewGroup.LayoutParams lp = item.getLayoutParams();
      if (lp != null) {
        java.lang.reflect.Field cached = HOLDER_FIELDS.get(lp.getClass());
        if (cached != null) {
          Object v = cached.get(lp);
          if (v != null && looksLikeViewHolder(v)) return v;
        }
        for (Class<?> c = lp.getClass(); c != null && c != Object.class; c = c.getSuperclass()) {
          for (java.lang.reflect.Field f : c.getDeclaredFields()) {
            if (java.lang.reflect.Modifier.isStatic(f.getModifiers())) continue;
            f.setAccessible(true);
            Object v = f.get(lp);
            if (v != null && looksLikeViewHolder(v)) {
              HOLDER_FIELDS.put(lp.getClass(), f);
              if (holderPathLogged++ < 1) XLog.i("view holder via LayoutParams."
                + f.getName() + ": " + v.getClass().getName());
              return v;
            }
          }
        }
      }
    } catch (Throwable t) {
      XLog.w("LayoutParams holder lookup failed", t);
    }

    // 3. any method taking a View and returning something holder-shaped
    try {
      for (Method m : list.getClass().getMethods()) {
        Class<?>[] ps = m.getParameterTypes();
        if (ps.length != 1 || !ps[0].isAssignableFrom(View.class)) continue;
        if (m.getReturnType() == void.class || m.getReturnType().isPrimitive()) continue;
        Object h = m.invoke(list, item);
        if (h != null && looksLikeViewHolder(h)) {
          if (holderPathLogged++ < 1) XLog.i("view holder via " + m.getName() + "(): "
            + h.getClass().getName());
          return h;
        }
      }
    } catch (Throwable ignored) {
      // give up; the LayoutParams graph scan is still available
    }

    if (holderPathLogged++ < 1) {
      XLog.w("no view holder found for " + idName(item)
        + "; falling back to the LayoutParams graph");
    }
    return null;
  }

  /**
   * A holder is recognised by having an "itemView"-like View field, not by its name:
   * RecyclerView$ViewHolder itself may have been renamed.
   */
  private static boolean looksLikeViewHolder(Object o) {
    for (Class<?> c = o.getClass(); c != null && c != Object.class; c = c.getSuperclass()) {
      if (c.getName().contains("ViewHolder")) return true;
      for (java.lang.reflect.Field f : c.getDeclaredFields()) {
        if (View.class.isAssignableFrom(f.getType())) return true;
      }
    }
    return false;
  }

  /** Topic for per-screen log budgets, so one screen cannot starve the other. */
  private static volatile String scanTopic = "?";

  private static void scanGraph(Object root, CallIdentity id) {

    // Fast path: the BFS below is far too heavy to run on every layout pass, so the
    // field path that produced an answer is remembered per holder class and replayed
    // directly -- a couple of field reads instead of hundreds.
    if (replayPaths(root, id)) return;

    try {
      scanGraphInner(root, id);
    } finally {
      // Must run on every exit path. The budget-exhausted return used to skip both of
      // these, so PARENTS grew without bound and the class was never marked as having
      // no timestamp -- meaning the whole walk repeated for every row, every frame.
      PARENTS.clear();
      if (id.date == 0) NO_DATE.add(root.getClass().getName());
    }
  }

  private static void scanGraphInner(Object root, CallIdentity id) {

    java.util.IdentityHashMap<Object, Boolean> seen = new java.util.IdentityHashMap<>();
    java.util.ArrayDeque<Object> queue = new java.util.ArrayDeque<>();
    java.util.ArrayDeque<Integer> depths = new java.util.ArrayDeque<>();
    queue.add(root);
    depths.add(0);
    int budget = 1200;

    while (!queue.isEmpty() && budget > 0) {
      Object o = queue.poll();
      int depth = depths.poll();
      if (o == null || depth > MAX_SCAN_DEPTH) continue;
      if (seen.put(o, Boolean.TRUE) != null) continue;

      // collections: look at the elements, not the collection's own plumbing
      if (o instanceof Iterable) {
        int n = 0;
        for (Object el : (Iterable<?>) o) {
          if (n++ > 16) break;
          consider(el, id);
          if (canDescend(el)) {
            // No Field describes a collection element, so the chain through it cannot
            // be replayed; the memo above is what keeps this affordable.
            queue.add(el);
            depths.add(depth + 1);
          }
        }
        continue;
      }

      for (Class<?> c = o.getClass(); c != null && c != Object.class; c = c.getSuperclass()) {
        if (isOpaque(c)) break;
        java.lang.reflect.Field[] fields;
        try {
          fields = c.getDeclaredFields();
        } catch (Throwable t) {
          break;
        }
        for (java.lang.reflect.Field f : fields) {
          if (java.lang.reflect.Modifier.isStatic(f.getModifiers())) continue;
          if (--budget <= 0) return;
          Object v;
          try {
            f.setAccessible(true);
            v = f.get(o);
          } catch (Throwable ignored) {
            continue;
          }
          if (v == null) continue;
          String before = id.number;
          long beforeDate = id.date;
          consider(v, id);
          if (!TextUtils.isEmpty(id.number) && TextUtils.isEmpty(before)) {
            recordPath(root, o, f, PATH_NUMBER);
            // The object holding the number is where a per-call timestamp would live,
            // so report it once per holder class: a targeted look beats widening the
            // walk again.
            if (Diag.budget("owner:" + scanTopic, 1)) {
              XLog.i("number found on " + o.getClass().getName() + "." + f.getName()
                + " -- fields of that object:");
              StringBuilder sb = new StringBuilder();
              describe(o, 0, sb, new java.util.IdentityHashMap<>());
              XLog.i(sb.toString());
            }
          }
          if (id.date != 0 && beforeDate == 0) {
            recordPath(root, o, f, PATH_DATE);
          }
          if (canDescend(v)) {
            PARENTS.put(v, new Object[]{ o, f });
            queue.add(v);
            depths.add(depth + 1);
          }
        }
      }
    }
  }

  //#region remembered field paths

  private static final int PATH_NUMBER = 0;
  private static final int PATH_DATE = 1;

  /** Parent links built during one BFS, used to reconstruct a path. Cleared after. */
  private static final java.util.IdentityHashMap<Object, Object[]> PARENTS =
    new java.util.IdentityHashMap<>();

  /** rootClassName -> { pathToNumber, pathToDate }, each a chain of fields. */
  private static final Map<String, java.lang.reflect.Field[][]> PATHS =
    new java.util.HashMap<>();

  private static void recordPath(Object root, Object owner, java.lang.reflect.Field field,
                                 int slot) {
    try {
      java.util.ArrayList<java.lang.reflect.Field> chain = new java.util.ArrayList<>();
      chain.add(field);
      Object cur = owner;
      for (int i = 0; i < MAX_SCAN_DEPTH + 2 && cur != root; i++) {
        Object[] link = PARENTS.get(cur);
        if (link == null) return; // incomplete chain, not worth caching
        chain.add(0, (java.lang.reflect.Field) link[1]);
        cur = link[0];
      }
      if (cur != root) return;
      String k = root.getClass().getName();
      java.lang.reflect.Field[][] entry = PATHS.get(k);
      if (entry == null) {
        entry = new java.lang.reflect.Field[2][];
        PATHS.put(k, entry);
      }
      entry[slot] = chain.toArray(new java.lang.reflect.Field[0]);
      XLog.d("cached path[" + slot + "] for " + k + " length " + chain.size());
    } catch (Throwable ignored) {
      // caching is an optimisation; never let it break resolution
    }
  }

  /**
   * @return true when every value we need came from the remembered paths.
   *
   * Must require the timestamp as well as the number. Reporting success on the number
   * alone meant that once the first history row cached a path to it, the full scan
   * never ran again and no row ever acquired a date -- so every one of them looked up
   * the same call.
   */
  private static boolean replayPaths(Object root, CallIdentity id) {
    String k = root.getClass().getName();
    java.lang.reflect.Field[][] entry = PATHS.get(k);
    if (entry == null) return false;
    Object n = walk(root, entry[PATH_NUMBER]);
    Object d = walk(root, entry[PATH_DATE]);
    if (n != null) consider(n, id);
    if (d != null) consider(d, id);
    if (TextUtils.isEmpty(id.number)) return false;
    // A model with no timestamp anywhere would otherwise re-run the full walk for
    // every row forever, so record that and stop paying for it.
    return id.date != 0 || NO_DATE.contains(k);
  }

  /** Holder classes a full scan has already failed to find any timestamp in. */
  private static final java.util.Set<String> NO_DATE =
    java.util.Collections.synchronizedSet(new java.util.HashSet<>());

  private static Object walk(Object root, java.lang.reflect.Field[] path) {
    if (path == null) return null;
    Object cur = root;
    try {
      for (java.lang.reflect.Field f : path) {
        if (cur == null) return null;
        f.setAccessible(true);
        cur = f.get(cur);
      }
    } catch (Throwable t) {
      return null;
    }
    return cur;
  }

  //#endregion

  private static final int MAX_SCAN_DEPTH = 7;

  /**
   * How deep inside a list item the containers we decorate may sit.
   *
   * The per-contact history entry is the deep one: item > card > swipeableContainer >
   * frame > entry_info_container > row > icon_container > first_line_icon_container
   * is already seven levels.
   */
  private static final int MAX_ROW_DEPTH = 8;

  /** Record a value if it looks like something that identifies the call. */
  private static void consider(Object v, CallIdentity id) {
    if (v == null) return;
    if (v instanceof long[]) {
      if (id.callIds == null && ((long[]) v).length > 0) id.callIds = (long[]) v;
    } else if (v instanceof CharSequence) {
      String str = v.toString();
      if (TextUtils.isEmpty(id.number) && looksLikeNumber(str)) id.number = str;
    } else if (v instanceof Long || v instanceof Integer) {
      long l = ((Number) v).longValue();
      long now = System.currentTimeMillis();
      long millis = 0;
      if (l > 1_000_000_000_000L && l < now + 86_400_000L) {
        millis = l;                     // epoch milliseconds
      } else if (l > 1_000_000_000L && l < now / 1000 + 86_400L) {
        millis = l * 1000L;             // epoch seconds -- fits in an int, and a model
                                        // storing them that way was invisible before.
                                        // Resource ids (~0x7f0…, over 2.1e9 as seconds)
                                        // fall outside the upper bound.
      }
      if (millis != 0 && BAD_DATES.contains(millis)) {
        millis = 0;   // a constant, not this call's time
      }
      if (millis != 0) {
        if (id.date == 0) id.date = millis;
        if (Diag.budget("epoch:" + scanTopic, 12)) XLog.i("  epoch candidate: " + millis);
      } else if (l > 1_000_000_000L && Diag.budget("bignum:" + scanTopic, 25)) {
        // Near misses matter: a timestamp in another unit or epoch would show up here
        // rather than being silently discarded.
        XLog.i("  large numeric (not epoch): " + l);
      }
    }
  }

  /**
   * Never walk into the view tree, resources, animators or threading plumbing.
   *
   * Animators are the expensive omission: the history row's holder keeps one, and the
   * scan spent its whole budget inside its handlers, interpolators and frame times
   * without ever reaching the call model, so every row resolved with no timestamp.
   * The class is obfuscated, so only an instanceof check catches it.
   */
  private static boolean canDescend(Object v) {
    if (v == null) return false;
    if (v instanceof View || v instanceof Context || v instanceof ClassLoader
      || v instanceof android.graphics.drawable.Drawable
      || v instanceof android.content.res.Resources
      || v instanceof android.animation.Animator
      || v instanceof android.animation.TimeInterpolator
      || v instanceof android.os.Handler
      || v instanceof android.os.Looper
      || v instanceof Thread
      || v instanceof java.util.concurrent.Executor) {
      return false;
    }
    Class<?> c = v.getClass();
    if (c.isPrimitive() || c.isArray()) return false;
    if (c.getName().startsWith("com.airbnb.")) return false; // Lottie
    return !isOpaque(c);
  }

  private static boolean isOpaque(Class<?> c) {
    String n = c.getName();
    return n.startsWith("java.lang.") || n.startsWith("java.math.")
      || n.startsWith("android.view.") || n.startsWith("android.widget.")
      || n.startsWith("android.content.") || n.startsWith("android.graphics.");
  }

  /**
   * Last-resort diagnostic: print the holder's graph with values masked, so an
   * unrecognised model can be identified without putting real numbers in the log.
   */
  private static void dumpHolderGraph(Object root) {
    if (holderDumps++ > 3) return;
    if (root == null) {
      XLog.w("nothing to dump: neither a view holder nor LayoutParams were available");
      return;
    }
    StringBuilder sb = new StringBuilder("identity graph from "
      + root.getClass().getName() + " (values masked):\n");
    describe(root, 0, sb, new java.util.IdentityHashMap<>());
    XLog.i(sb.toString());
  }

  private static void describe(Object o, int depth, StringBuilder sb,
                               java.util.IdentityHashMap<Object, Boolean> seen) {
    if (o == null || depth > 3 || seen.put(o, Boolean.TRUE) != null) return;
    for (Class<?> c = o.getClass(); c != null && c != Object.class; c = c.getSuperclass()) {
      if (isOpaque(c)) break;
      for (java.lang.reflect.Field f : c.getDeclaredFields()) {
        if (java.lang.reflect.Modifier.isStatic(f.getModifiers())) continue;
        Object v;
        try {
          f.setAccessible(true);
          v = f.get(o);
        } catch (Throwable ignored) {
          continue;
        }
        for (int i = 0; i <= depth; i++) sb.append("  ");
        sb.append(f.getType().getSimpleName()).append(' ').append(f.getName())
          .append(" = ").append(summarise(v)).append('\n');
        if (canDescend(v) && !(v instanceof CharSequence)) describe(v, depth + 1, sb, seen);
      }
    }
  }

  private static String summarise(Object v) {
    if (v == null) return "null";
    if (v instanceof CharSequence) return "\"" + Diag.mask(v.toString()) + "\"";
    if (v instanceof long[]) return "long[" + ((long[]) v).length + "]";
    if (v instanceof Number || v instanceof Boolean) return String.valueOf(v);
    return "<" + v.getClass().getSimpleName() + ">";
  }



  /**
   * Call length in seconds from the row's duration label.
   *
   * Only the digits are used: "23 s" is one run, "1 min 27 s" is two, and two runs
   * unambiguously mean minutes and seconds. A single run is ambiguous between the
   * two, so it is returned as seconds and the caller resolves it against the
   * durations BCR-GUI actually holds. This avoids depending on the unit words, which
   * are localised.
   */
  private static int readDurationSeconds(View anyViewInRow) {
    View row = anyViewInRow;
    while (row != null && !(row instanceof ViewGroup && findChildById((ViewGroup) row,
      profile.historyDurationId) != null)) {
      row = row.getParent() instanceof View ? (View) row.getParent() : null;
    }
    if (row == null) return 0;
    View label = findChildById((ViewGroup) row, profile.historyDurationId);
    if (!(label instanceof TextView)) return 0;
    CharSequence text = ((TextView) label).getText();
    if (text == null || text.length() == 0) return 0;

    java.util.ArrayList<Integer> runs = new java.util.ArrayList<>(3);
    int value = -1;
    for (int i = 0; i < text.length(); i++) {
      char c = text.charAt(i);
      if (Character.isDigit(c)) {
        value = (value < 0 ? 0 : value * 10) + Character.digit(c, 10);
      } else if (value >= 0) {
        runs.add(value);
        value = -1;
      }
    }
    if (value >= 0) runs.add(value);

    if (runs.isEmpty()) return 0;
    if (runs.size() == 1) return runs.get(0);
    if (runs.size() == 2) return runs.get(0) * 60 + runs.get(1);
    return runs.get(0) * 3600 + runs.get(1) * 60 + runs.get(2);
  }

  /**
   * Day, hour and minute from the row's time label.
   *
   * Only digits are read: "11:08", "18 may, 14:20" and "Mar, 11:49" all parse without
   * knowing the locale's month or weekday names. The last two runs are always the
   * time; anything before them is the day of the month. When the device is on a
   * 12-hour clock the hour is ambiguous, and both readings are accepted later.
   */
  private static void readRowTime(View item, CallIdentity id) {
    if (!(item instanceof ViewGroup)) return;
    View label = findByIdDeep((ViewGroup) item, profile.historyTimeId, 0);
    if (!(label instanceof TextView)) return;
    CharSequence text = ((TextView) label).getText();
    if (text == null || text.length() == 0) return;

    // Exact instant, if the host rendered this string through a platform formatter.
    Long exact = AMBIGUOUS_TIME_TEXTS.contains(text.toString())
      ? null : TIME_TEXTS.get(text.toString());
    if (exact != null) {
      id.date = exact;
      if (Diag.budget("exact-time", 40)) {
        XLog.i("row time taken from the formatter: \"" + text + "\" -> "
          + new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss",
              java.util.Locale.US).format(new java.util.Date(exact)));
      }
      return;
    }

    java.util.ArrayList<Integer> runs = new java.util.ArrayList<>(4);
    int value = -1;
    for (int i = 0; i < text.length(); i++) {
      char c = text.charAt(i);
      if (Character.isDigit(c)) {
        value = (value < 0 ? 0 : value * 10) + Character.digit(c, 10);
      } else if (value >= 0) {
        runs.add(value);
        value = -1;
      }
    }
    if (value >= 0) runs.add(value);
    if (runs.size() < 2) return;

    id.rowMinute = runs.get(runs.size() - 1);
    id.rowHour = runs.get(runs.size() - 2);
    if (runs.size() >= 3) id.rowDay = runs.get(runs.size() - 3);
    if (id.rowHour > 23 || id.rowMinute > 59) {
      id.rowHour = id.rowMinute = -1;   // not a time after all
      return;
    }

    // Day and time alone are not unique: two calls to the same contact on the same
    // day-of-month in different months, a minute apart, matched each other. The month
    // name is read from the platform's own localised symbols rather than parsed.
    //
    // Which name to look for is decided by whether the row carries a day number, not
    // by trying months first: abbreviations collide across the two sets. In Spanish
    // "mar" is both martes and marzo, so a Tuesday row was being read as March.
    String lower = text.toString().toLowerCase(java.util.Locale.getDefault());
    java.text.DateFormatSymbols sym =
      java.text.DateFormatSymbols.getInstance(java.util.Locale.getDefault());
    if (id.rowDay >= 0) {
      id.rowMonth = indexOfName(lower, sym.getShortMonths(), sym.getMonths());
    } else {
      id.rowWeekday = indexOfName(lower, sym.getShortWeekdays(), sym.getWeekdays()) >= 0;
    }
  }

  /** Index of whichever localised name appears in the text, or -1. */
  private static int indexOfName(String lower, String[] shortNames, String[] longNames) {
    for (int i = 0; i < longNames.length; i++) {
      if (matchesName(lower, longNames[i]) || matchesName(lower, shortNames[i])) return i;
    }
    return -1;
  }

  private static boolean matchesName(String lower, String name) {
    if (name == null || name.length() < 3) return false;
    String n = name.toLowerCase(java.util.Locale.getDefault());
    while (n.endsWith(".")) n = n.substring(0, n.length() - 1);
    return n.length() >= 3 && lower.contains(n);
  }

  private static boolean looksLikeNumber(String s) {
    if (s == null) return false;
    int digits = 0;
    for (int i = 0; i < s.length(); i++) {
      char ch = s.charAt(i);
      if (ch >= '0' && ch <= '9') digits++;
      else if (ch != '+' && ch != '-' && ch != ' ' && ch != '(' && ch != ')' && ch != '.') {
        return false;
      }
    }
    return digits >= 5 && digits <= 18;
  }

  private static String scrapeNumber(View item) {
    if (item instanceof TextView) {
      CharSequence t = ((TextView) item).getText();
      if (t != null && looksLikeNumber(t.toString())) return t.toString();
    }
    if (item instanceof ViewGroup) {
      ViewGroup vg = (ViewGroup) item;
      for (int i = 0; i < vg.getChildCount(); i++) {
        String r = scrapeNumber(vg.getChildAt(i));
        if (!TextUtils.isEmpty(r)) return r;
      }
    }
    return "";
  }

  //#endregion



  /**
   * Hand the ring buffer to BCR-GUI so it can be exported from the phone.
   *
   * Sent on the config poll rather than continuously: the buffer is only worth moving
   * when it has grown, and this keeps a bounded, occasional Binder payload instead of
   * a stream. Pushed even with diagnostics off, so a user reporting a problem has the
   * run-up to it without having had to predict the problem.
   */
  private static void pushDiagnostics(boolean force) {
    if (appCtx == null) return;
    long now = android.os.SystemClock.uptimeMillis();
    if (!force && now - lastDiagnosticsPush < DIAGNOSTICS_PUSH_MS) return;
    lastDiagnosticsPush = now;

    WORKER.execute(() -> {
      try {
        java.util.List<String> lines = XLog.snapshot();
        if (lines.isEmpty()) return;
        android.os.Bundle extras = new android.os.Bundle();
        extras.putStringArray(DialerLink.EXTRA_LINES, lines.toArray(new String[0]));
        extras.putString(DialerLink.EXTRA_SOURCE,
          appCtx.getPackageName() + " / " + profile.label
            + " / module v" + XposedEntry.MODULE_VERSION);
        appCtx.getContentResolver().call(DialerLink.BASE_URI,
          DialerLink.METHOD_PUSH_DIAGNOSTICS, null, extras);
      } catch (Throwable t) {
        // BCR-GUI may be unreachable; the ring and logcat still hold everything
        XLog.d("cannot push diagnostics: " + t);
      }
    });
  }

  private static volatile long lastDiagnosticsPush;

  /** Two minutes: often enough to be current, rare enough to be free. */
  private static final long DIAGNOSTICS_PUSH_MS = 120_000L;

  //#region diagnostics

  /**
   * Long-press dump. Writes the row's view tree and the reflected ViewHolder to the
   * log so an unsupported dialer can be diagnosed from the file alone.
   */
  private static void dumpDiagnostics(View from) {
    try {
      XLog.Diag.verbose = true;
      XLog.i("===== DIAGNOSTIC DUMP =====");
      XLog.i("module v" + XposedEntry.MODULE_VERSION
        + " host=" + from.getContext().getPackageName());

      View item = from;
      for (int i = 0; i < 12 && item.getParent() instanceof ViewGroup; i++) {
        ViewGroup p = (ViewGroup) item.getParent();
        String cn = p.getClass().getName();
        if (cn.endsWith("RecyclerView") || p instanceof android.widget.AbsListView) {
          XLog.i("list class: " + cn);
          break;
        }
        item = p;
      }

      StringBuilder sb = new StringBuilder("view tree of the call-log row:\n");
      dumpTree(item, 0, sb);
      XLog.i(sb.toString());

      CallIdentity id = resolveRaw(from);
      XLog.i("resolved identity: " + (id == null ? "<none>"
        : "number=" + id.number + " date=" + id.date
        + " callIds=" + (id.callIds == null ? "null" : java.util.Arrays.toString(id.callIds))));

      XLog.i("config: enabled=" + RecordingIndex.readConfig().enabled);
      XLog.i("log file: " + XLog.getLogPath());
      XLog.i("===== END DUMP =====");

      pushDiagnostics(true);
      android.widget.Toast.makeText(from.getContext(),
        "BCR-GUI: diagnostics collected, export them from BCR-GUI settings",
        android.widget.Toast.LENGTH_LONG).show();
    } catch (Throwable t) {
      XLog.e("dump failed", t);
    }
  }

  private static void dumpTree(View v, int depth, StringBuilder sb) {
    if (depth > 10) return;
    for (int i = 0; i < depth; i++) sb.append("  ");
    sb.append(v.getClass().getName())
      .append(" id=").append(idName(v))
      .append(" vis=").append(v.getVisibility() == View.VISIBLE ? "V"
        : v.getVisibility() == View.GONE ? "GONE" : "INVIS")
      .append(" ").append(v.getWidth()).append('x').append(v.getHeight());
    // the LayoutParams type is what decides whether a sibling can just be added:
    // a ConstraintLayout child without constraints lands at 0,0
    ViewGroup.LayoutParams lp = v.getLayoutParams();
    if (lp != null) sb.append(" lp=").append(lp.getClass().getSimpleName());
    if (v.isClickable()) sb.append(" CLICKABLE");
    if (v instanceof TextView) {
      sb.append(" text=\"").append(((TextView) v).getText()).append('"');
    }
    if (v.getContentDescription() != null) {
      sb.append(" desc=\"").append(v.getContentDescription()).append('"');
    }
    sb.append('\n');
    if (v instanceof ViewGroup) {
      ViewGroup vg = (ViewGroup) v;
      for (int i = 0; i < vg.getChildCount(); i++) dumpTree(vg.getChildAt(i), depth + 1, sb);
    }
  }

  //#endregion
}
