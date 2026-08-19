package com.github.nicorac.xposed;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract;
import android.telephony.PhoneNumberUtils;
import android.text.TextUtils;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Serves recordings to the dialer-side Xposed module.
 *
 * BCR-GUI is the only process holding the persisted SAF grant on the recordings
 * directory, so the dialer can never read those files itself. This provider answers
 * "is there a recording for this call?" and hands back a read-only file descriptor
 * for the matched recording -- never a raw SAF uri, so the caller cannot ask for an
 * arbitrary file.
 *
 * Access is denied unless ALL of the following hold:
 *   - the caller is BCR-GUI itself, or the device's current default dialer;
 *   - the user enabled dialer integration in BCR-GUI settings.
 */
public class RecordingsProvider extends ContentProvider {

  private static final String TAG = "BcrGuiDialerLink";

  /** Re-list the recordings dir at most this often when falling back (ms). */
  private static final long DIR_CACHE_TTL = 30_000L;

  /** How often the recordings DB may be re-stat'ed (ms). */
  private static final long DB_RECHECK_MS = 10_000L;

  /** Cap on the recordings DB we are willing to read into memory. */
  private static final int MAX_DB_BYTES = 32 * 1024 * 1024;

  //#region cached state

  private final Object cacheLock = new Object();
  private List<Rec> dbCache;
  private String dbCacheUri;
  private long dbCacheStamp = -1;
  private long dbCheckedAt;

  private Index indexCache;
  private List<Rec> indexedList;

  private List<Rec> mergedCache;
  private List<Rec> mergedDb;
  private List<Rec> mergedDir;

  private List<Rec> dirCache;
  private long dirCacheAt;
  private String dirCacheUri;

  //#endregion

  @Override
  public boolean onCreate() {
    return true;
  }

  @Nullable
  @Override
  public Cursor query(@NonNull Uri uri, @Nullable String[] projection, @Nullable String selection,
                      @Nullable String[] selectionArgs, @Nullable String sortOrder) {

    Settings st = readSettings();
    String path = firstSegment(uri);

    // the config endpoint is what the module polls to discover whether it should do
    // anything at all, so it answers (with enabled=0) even while integration is off.
    if (DialerLink.PATH_CONFIG.equals(path)) {
      requireKnownCaller();
      if (!DialerLink.APP_PACKAGE.equals(getCallingPackage())) noteDialerContact();
      MatrixCursor c = new MatrixCursor(DialerLink.CONFIG_COLUMNS, 1);
      c.addRow(new Object[]{
        st.dialerIntegrationEnabled ? 1 : 0,
        st.seekTime,
        st.playbackSpeed,
        st.developerMode ? 1 : 0,
        getContext().getString(com.github.nicorac.bcrgui.R.string.xposed_play_label),
      });
      return c;
    }

    if (DialerLink.PATH_LOOKUP.equals(path)) {
      requireAllowedCaller(st);

      String number = uri.getQueryParameter(DialerLink.QP_NUMBER);
      long at = parseLong(uri.getQueryParameter(DialerLink.QP_AT), 0L);
      long window = parseLong(uri.getQueryParameter(DialerLink.QP_WINDOW), DialerLink.DEFAULT_WINDOW_MS);

      List<Rec> matches = lookup(st, number, at, window);
      MatrixCursor c = new MatrixCursor(DialerLink.LOOKUP_COLUMNS, matches.size());
      for (Rec r : matches) {
        c.addRow(new Object[]{
          r.id,
          DialerLink.audioUri(r.id).toString(),
          r.name,
          r.number,
          r.date,
          r.duration,
          r.mime,
          r.direction,
        });
      }
      return c;
    }

    throw new IllegalArgumentException("unsupported uri: " + uri);
  }

  @Nullable
  @Override
  public ParcelFileDescriptor openFile(@NonNull Uri uri, @NonNull String mode)
    throws FileNotFoundException {

    // read-only, always: this provider exists to play back, never to modify
    if (!"r".equals(mode)) {
      throw new SecurityException("read-only provider");
    }

    Settings st = readSettings();
    requireAllowedCaller(st);

    if (!DialerLink.PATH_AUDIO.equals(firstSegment(uri))) {
      throw new FileNotFoundException("unsupported uri: " + uri);
    }
    String id = uri.getLastPathSegment();
    if (TextUtils.isEmpty(id)) {
      throw new FileNotFoundException("missing id");
    }

    // Resolve the opaque id back to a known recording. The caller never supplies a
    // SAF uri, so it cannot reach any file we did not ourselves enumerate.
    Rec rec = null;
    for (Rec r : allRecordings(st)) {
      if (r.id.equals(id)) { rec = r; break; }
    }
    if (rec == null) {
      throw new FileNotFoundException("unknown recording: " + id);
    }

    Context ctx = getContext();
    if (ctx == null) throw new FileNotFoundException("no context");
    ParcelFileDescriptor pfd =
      ctx.getContentResolver().openFileDescriptor(Uri.parse(rec.audioUri), "r");
    if (pfd == null) {
      throw new FileNotFoundException("cannot open: " + rec.audioDisplayName);
    }
    return pfd;
  }

  @Nullable
  @Override
  public android.os.Bundle call(@NonNull String method, @Nullable String arg,
                                @Nullable android.os.Bundle extras) {

    if (!DialerLink.METHOD_PUSH_DIAGNOSTICS.equals(method)) {
      return null;
    }
    // Same rule as everything else here: only the current default dialer, and only
    // once the user has enabled the integration.
    requireAllowedCaller(readSettings());
    if (extras == null) return null;

    String[] lines = extras.getStringArray(DialerLink.EXTRA_LINES);
    if (lines == null || lines.length == 0) return null;
    String source = extras.getString(DialerLink.EXTRA_SOURCE, getCallingPackage());

    Context ctx = getContext();
    if (ctx == null) return null;
    try {
      java.io.File out = new java.io.File(ctx.getFilesDir(), DialerLink.DIAGNOSTICS_FILE);
      // Replaced rather than appended: this is the module's whole buffer each time,
      // so appending would just accumulate copies of the same lines.
      try (java.io.PrintWriter w = new java.io.PrintWriter(
        new java.io.OutputStreamWriter(new java.io.FileOutputStream(out, false),
          StandardCharsets.UTF_8))) {
        w.println("# BCR-GUI dialer diagnostics");
        w.println("# source: " + source);
        w.println("# collected: " + new java.util.Date());
        for (String line : lines) w.println(line);
      }
      Log.i(TAG, "stored " + lines.length + " diagnostic lines from " + source);
    } catch (Throwable t) {
      Log.w(TAG, "cannot store diagnostics", t);
    }
    return null;
  }

  @Nullable
  @Override
  public String getType(@NonNull Uri uri) {
    if (DialerLink.PATH_AUDIO.equals(firstSegment(uri))) {
      String id = uri.getLastPathSegment();
      for (Rec r : allRecordings(readSettings())) {
        if (r.id.equals(id)) return r.mime;
      }
      return "audio/*";
    }
    return null;
  }

  @Nullable
  @Override
  public Uri insert(@NonNull Uri uri, @Nullable ContentValues values) {
    throw new UnsupportedOperationException("read-only provider");
  }

  @Override
  public int delete(@NonNull Uri uri, @Nullable String s, @Nullable String[] args) {
    throw new UnsupportedOperationException("read-only provider");
  }

  @Override
  public int update(@NonNull Uri uri, @Nullable ContentValues v, @Nullable String s,
                    @Nullable String[] args) {
    throw new UnsupportedOperationException("read-only provider");
  }

  //#region access control

  /** Any caller we are willing to even acknowledge (used by the config endpoint). */
  private void requireKnownCaller() {
    String caller = getCallingPackage();
    if (caller == null) {
      throw new SecurityException("anonymous caller");
    }
    if (DialerLink.APP_PACKAGE.equals(caller) || caller.equals(defaultDialer())) {
      return;
    }
    throw new SecurityException("caller not allowed: " + caller);
  }

  /** Callers allowed to see and read actual recordings. */
  private void requireAllowedCaller(Settings st) {
    String caller = getCallingPackage();
    if (DialerLink.APP_PACKAGE.equals(caller)) {
      return; // our own app
    }
    requireKnownCaller();
    noteDialerContact();
    if (!st.dialerIntegrationEnabled) {
      throw new SecurityException("dialer integration is disabled in BCR-GUI settings");
    }
  }

  /**
   * Record that the dialer-side module reached us.
   *
   * The app's own "is the module active" probe only proves the module was loaded into
   * BCR-GUI's process, which is a different question from whether the integration is
   * working -- and it answers "no" whenever the framework does not scope the module to
   * BCR-GUI itself, even while the dialer side runs perfectly. A query arriving from
   * the dialer is direct evidence of the thing the user actually cares about.
   */
  private void noteDialerContact() {
    Context ctx = getContext();
    if (ctx == null) return;
    long now = System.currentTimeMillis();
    if (now - lastContactWrite < 60_000L) return;   // one write a minute is plenty
    lastContactWrite = now;
    try {
      ctx.getSharedPreferences(DialerLink.LINK_PREFS, Context.MODE_PRIVATE)
        .edit().putLong(DialerLink.KEY_LAST_DIALER_CONTACT, now).apply();
    } catch (Throwable t) {
      Log.w(TAG, "cannot record dialer contact", t);
    }
  }

  private volatile long lastContactWrite;

  @Nullable
  private String defaultDialer() {
    Context ctx = getContext();
    return ctx == null ? null : DialerLink.defaultDialer(ctx);
  }

  //#endregion

  //#region settings

  private static final class Settings {
    String recordingsDirectoryUri = "";
    String dbFileUri = "";
    int seekTime = 10;
    double playbackSpeed = 1;
    boolean developerMode = false;
    boolean dialerIntegrationEnabled = false;
    String filenamePattern = "";
  }

  private Settings readSettings() {
    Settings s = new Settings();
    Context ctx = getContext();
    if (ctx == null) return s;
    JSONObject o = DialerLink.readSettingsJson(ctx);
    s.recordingsDirectoryUri = o.optString("recordingsDirectoryUri", "");
    s.dbFileUri = o.optString("dbFileUri", "");
    s.seekTime = o.optInt("seekTime", 10);
    s.playbackSpeed = o.optDouble("playbackSpeed", 1);
    s.developerMode = o.optBoolean("developerMode", false)
      || o.optBoolean("dialerDiagnostics", false);
    s.filenamePattern = o.optString("filenamePattern", "");
    s.dialerIntegrationEnabled = o.optBoolean("dialerIntegrationEnabled", false);
    return s;
  }

  //#endregion

  //#region recordings

  /** One recording, from either the BCR-GUI DB or a directory listing. */
  private static final class Rec {
    String id;
    String audioUri;
    String audioDisplayName = "";
    String name = "";
    String number = "";
    long date;
    int duration;
    String mime = "audio/*";
    String direction = "";
  }

  private List<Rec> lookup(Settings st, String number, long at, long window) {

    List<Rec> all = allRecordings(st);
    List<Rec> out = new ArrayList<>();
    boolean haveNumber = !TextUtils.isEmpty(number);

    // Candidates come from an index bucketed on the last 7 digits, so a lookup touches
    // the handful of recordings for that subscriber rather than the whole collection
    // once per visible row. Recordings whose number could not be parsed stay in a
    // separate list and are still compared one by one.
    List<Rec> candidates = all;
    if (haveNumber) {
      Index idx = indexOf(all);
      candidates = new ArrayList<>(idx.unindexed);
      List<Rec> bucket = idx.byNumber.get(bucketKey(number));
      if (bucket != null) candidates.addAll(bucket);
    }

    for (Rec r : candidates) {
      if (haveNumber && !numbersMatch(number, r.number)) continue;
      if (at > 0 && Math.abs(r.date - at) > window) continue;
      out.add(r);
    }

    // nearest call first, so a grouped call-log row plays the right one
    if (at > 0) {
      final long ref = at;
      Collections.sort(out, (a, b) ->
        Long.compare(Math.abs(a.date - ref), Math.abs(b.date - ref)));
    } else {
      Collections.sort(out, (a, b) -> Long.compare(b.date, a.date));
    }
    return out;
  }

  /**
   * DB contents, plus any file in the recordings dir that the DB does not know about
   * yet. The second part matters: a call recorded a minute ago is not in the DB until
   * BCR-GUI is opened and refreshes, and playing the call you just finished is exactly
   * the case this feature exists for.
   */
  private List<Rec> allRecordings(Settings st) {

    List<Rec> db = loadDb(st);
    List<Rec> dir = listDirectory(st);

    // Both sides are cached, so reuse the merge too while neither has changed. The
    // dialer asks once per visible row, and rebuilding this per query made scrolling
    // visibly lag.
    synchronized (cacheLock) {
      if (mergedCache != null && mergedDb == db && mergedDir == dir) return mergedCache;
    }

    // Set membership rather than a nested scan: the old loop was O(db x dir).
    java.util.HashSet<String> known = new java.util.HashSet<>(db.size() * 2);
    for (Rec r : db) known.add(r.audioUri);
    List<Rec> res = new ArrayList<>(db);
    for (Rec fresh : dir) {
      if (known.add(fresh.audioUri)) res.add(fresh);
    }

    synchronized (cacheLock) {
      mergedCache = res;
      mergedDb = db;
      mergedDir = dir;
    }
    return res;
  }

  private List<Rec> loadDb(Settings st) {

    if (TextUtils.isEmpty(st.dbFileUri)) return Collections.emptyList();
    Context ctx = getContext();
    if (ctx == null) return Collections.emptyList();

    // Checking the DB's mtime means a SAF query, and the dialer asks once per visible
    // row, so re-stat at most this often instead of on every lookup.
    synchronized (cacheLock) {
      if (dbCache != null && st.dbFileUri.equals(dbCacheUri)
        && System.currentTimeMillis() - dbCheckedAt < DB_RECHECK_MS) {
        return dbCache;
      }
    }
    long stamp = lastModified(ctx, st.dbFileUri);
    synchronized (cacheLock) {
      dbCheckedAt = System.currentTimeMillis();
      if (dbCache != null && st.dbFileUri.equals(dbCacheUri) && stamp == dbCacheStamp) {
        return dbCache;
      }
    }

    List<Rec> parsed = new ArrayList<>();
    try (InputStream in = ctx.getContentResolver().openInputStream(Uri.parse(st.dbFileUri))) {
      if (in == null) return Collections.emptyList();
      String json = readAll(in);
      JSONArray data = new JSONObject(json).optJSONArray("data");
      if (data != null) {
        for (int i = 0; i < data.length(); i++) {
          JSONObject o = data.optJSONObject(i);
          if (o == null) continue;
          Rec r = new Rec();
          r.audioUri = o.optString("audioUri", "");
          if (TextUtils.isEmpty(r.audioUri)) continue;
          r.id = idOf(r.audioUri);
          r.audioDisplayName = o.optString("audioDisplayName", "");
          r.name = o.optString("opName", "");
          r.number = o.optString("opNumber", "");
          r.date = o.optLong("date", 0);
          r.duration = o.optInt("duration", 0);
          r.mime = o.optString("mimeType", "audio/*");
          r.direction = o.optString("direction", "");
          parsed.add(r);
        }
      }
    } catch (Throwable t) {
      Log.w(TAG, "cannot read recordings DB", t);
      return Collections.emptyList();
    }

    synchronized (cacheLock) {
      dbCache = parsed;
      dbCacheUri = st.dbFileUri;
      dbCacheStamp = stamp;
    }
    return parsed;
  }

  /**
   * Shallow listing of the recordings directory. No filename-pattern parsing here --
   * that lives in the app's TypeScript and is not worth duplicating; matching on the
   * digits present in the filename plus the file mtime is enough to bridge the gap
   * until BCR-GUI refreshes its DB.
   */
  private List<Rec> listDirectory(Settings st) {

    if (TextUtils.isEmpty(st.recordingsDirectoryUri)) return Collections.emptyList();
    Context ctx = getContext();
    if (ctx == null) return Collections.emptyList();

    synchronized (cacheLock) {
      if (dirCache != null
        && st.recordingsDirectoryUri.equals(dirCacheUri)
        && System.currentTimeMillis() - dirCacheAt < DIR_CACHE_TTL) {
        return dirCache;
      }
    }

    Pattern pattern = compilePattern(st.filenamePattern);
    List<Rec> res = new ArrayList<>();
    try {
      Uri tree = Uri.parse(st.recordingsDirectoryUri);
      Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(
        tree, DocumentsContract.getTreeDocumentId(tree));
      String[] cols = {
        DocumentsContract.Document.COLUMN_DOCUMENT_ID,
        DocumentsContract.Document.COLUMN_DISPLAY_NAME,
        DocumentsContract.Document.COLUMN_MIME_TYPE,
        DocumentsContract.Document.COLUMN_LAST_MODIFIED,
      };
      try (Cursor c = ctx.getContentResolver().query(children, cols, null, null, null)) {
        while (c != null && c.moveToNext()) {
          String mime = c.getString(2);
          if (mime == null || !mime.startsWith("audio/")) continue;
          Rec r = new Rec();
          r.audioUri = DocumentsContract
            .buildDocumentUriUsingTree(tree, c.getString(0)).toString();
          r.id = idOf(r.audioUri);
          r.audioDisplayName = c.getString(1) == null ? "" : c.getString(1);
          r.name = r.audioDisplayName;
          r.mime = mime;
          r.date = c.getLong(3);
          applyFilenamePattern(r, pattern);
          res.add(r);
        }
      }
    } catch (Throwable t) {
      Log.w(TAG, "cannot list recordings dir", t);
      return Collections.emptyList();
    }

    synchronized (cacheLock) {
      dirCache = res;
      dirCacheUri = st.recordingsDirectoryUri;
      dirCacheAt = System.currentTimeMillis();
    }
    return res;
  }

  /** Last 7 digits, the span PhoneNumberUtils.compare treats as significant. */
  private static String bucketKey(String number) {
    String d = digitsOf(number);
    return d.length() <= 7 ? d : d.substring(d.length() - 7);
  }

  private static final class Index {
    final java.util.HashMap<String, List<Rec>> byNumber = new java.util.HashMap<>();
    final List<Rec> unindexed = new ArrayList<>();
  }

  /** Index over the merged list, rebuilt only when that list itself changes. */
  private Index indexOf(List<Rec> all) {
    synchronized (cacheLock) {
      if (indexCache != null && indexedList == all) return indexCache;
    }
    Index idx = new Index();
    for (Rec r : all) {
      String digits = digitsOf(r.number);
      // A filename we could not parse leaves every digit in the name as the "number",
      // which cannot be bucketed meaningfully -- compare those individually.
      if (digits.length() < 7 || digits.length() > 15) {
        idx.unindexed.add(r);
        continue;
      }
      String k = bucketKey(digits);
      List<Rec> bucket = idx.byNumber.get(k);
      if (bucket == null) {
        bucket = new ArrayList<>(2);
        idx.byNumber.put(k, bucket);
      }
      bucket.add(r);
    }
    synchronized (cacheLock) {
      indexCache = idx;
      indexedList = all;
    }
    return idx;
  }

  //#endregion

  //#region filename pattern

  /**
   * Compile the user's filename pattern the same way the app does.
   *
   * BCR-GUI supports several recorders -- BCR, GrapheneOS, ColorOS, Huawei, LineageOS,
   * ShizuCallRecorder, True Phone -- each with its own filename layout, chosen in
   * settings. Matching on "any digits in the name" would only ever work for the
   * recorders that happen to put the number there in a recognisable form, and would
   * read a date out of whatever digits came first.
   *
   * Group names differ from the TypeScript side on purpose: Java rejects underscores
   * in named groups, so date_year becomes dateyear and so on.
   */
  private static Pattern compilePattern(String pattern) {
    if (TextUtils.isEmpty(pattern)) return null;
    try {
      String p = pattern;
      // {date} is shorthand for the full BCR stamp, expanded exactly as the app does
      p = p.replace("{date}", "{date:year}{date:month}{date:day}_{date:hours}"
        + "{date:minutes}{date:seconds}{date:tzHours}{date:tzMinutes}");
      p = p.replace("{date:year}", "(?<dateyear>\\d{4})");
      p = p.replace("{date:year2}", "(?<dateyear2>\\d{2})");
      p = p.replace("{date:month}", "(?<datemonth>\\d{2})");
      p = p.replace("{date:day}", "(?<dateday>\\d{2})");
      p = p.replace("{date:hours}", "(?<datehours>\\d{2})");
      p = p.replace("{date:minutes}", "(?<dateminutes>\\d{2})");
      p = p.replace("{date:seconds}", "(?<dateseconds>\\d{2}(\\.\\d{1,3})?)");
      p = p.replace("{date:tzHours}", "(?<datetzHours>[\\+\\-]?\\d{2})");
      p = p.replace("{date:tzMinutes}", "(?<datetzMinutes>\\d{2})");
      p = p.replace("{date:ampm}", "(?<dateampm>AM|PM)");
      p = p.replace("{direction}", "(?<direction>in|out|conference)");
      p = p.replace("{phone_number}", "(?<phonenumber>[\\d\\+\\- ]+|unknown)");
      p = p.replace("{sim_slot}", "(?<simslot>\\d+)");
      p = p.replace("{caller_name}", "(?<callername>.*)");
      p = p.replace("{contact_name}", "(?<callername>.*)");
      p = p.replace("{call_log_name}", "(?<callername>.*)");
      // the app's own templates may already contain a literal (?<phone_number>..)
      p = p.replace("(?<phone_number>", "(?<phonenumber>");
      return Pattern.compile(p);
    } catch (Throwable t) {
      Log.w(TAG, "cannot compile filename pattern: " + pattern, t);
      return null;
    }
  }

  /** Fill number and date from the filename, falling back to the file's mtime. */
  private static void applyFilenamePattern(Rec r, Pattern pattern) {

    String base = r.audioDisplayName;
    int dot = base.lastIndexOf('.');
    if (dot > 0) base = base.substring(0, dot);

    if (pattern != null) {
      try {
        Matcher m = pattern.matcher(base);
        if (m.find()) {
          String num = group(m, "phonenumber");
          if (!TextUtils.isEmpty(num)) r.number = num.trim();
          String name = group(m, "callername");
          if (!TextUtils.isEmpty(name)) r.name = name.trim();
          String dir = group(m, "direction");
          if (dir != null) r.direction = dir;
          long when = dateFrom(m);
          if (when > 0) r.date = when;
          if (!TextUtils.isEmpty(r.number)) return;
        }
      } catch (Throwable t) {
        Log.w(TAG, "filename pattern did not apply to " + r.audioDisplayName, t);
      }
    }

    // No pattern, or it did not match: every digit in the name is the best guess left
    if (TextUtils.isEmpty(r.number)) r.number = digitsOf(base);
  }

  private static long dateFrom(Matcher m) {
    try {
      String year = group(m, "dateyear");
      if (year == null) {
        String y2 = group(m, "dateyear2");
        if (y2 != null) year = "20" + y2;
      }
      String month = group(m, "datemonth");
      String day = group(m, "dateday");
      String hours = group(m, "datehours");
      String minutes = group(m, "dateminutes");
      String seconds = group(m, "dateseconds");
      if (year == null || month == null || day == null || hours == null || minutes == null) {
        return 0;
      }
      int h = Integer.parseInt(hours);
      String ampm = group(m, "dateampm");
      if (ampm != null) h = (h % 12) + ("AM".equalsIgnoreCase(ampm) ? 0 : 12);

      java.util.Calendar cal = java.util.Calendar.getInstance();
      String tzH = group(m, "datetzHours");
      String tzM = group(m, "datetzMinutes");
      if (tzH != null && tzM != null) {
        String sign = tzH.startsWith("-") ? "-" : "+";
        cal.setTimeZone(java.util.TimeZone.getTimeZone(
          "GMT" + sign + tzH.replaceAll("[^0-9]", "") + ":" + tzM));
      }
      cal.clear();
      cal.set(Integer.parseInt(year), Integer.parseInt(month) - 1, Integer.parseInt(day),
        h, Integer.parseInt(minutes),
        seconds == null ? 0 : (int) Double.parseDouble(seconds));
      return cal.getTimeInMillis();
    } catch (Throwable t) {
      return 0;
    }
  }

  /** Named group that may not exist in this particular pattern. */
  private static String group(Matcher m, String name) {
    try {
      return m.group(name);
    } catch (Throwable t) {
      return null;
    }
  }

  //#endregion

  //#region helpers

  private static long lastModified(Context ctx, String uri) {
    String[] cols = { DocumentsContract.Document.COLUMN_LAST_MODIFIED };
    try (Cursor c = ctx.getContentResolver().query(Uri.parse(uri), cols, null, null, null)) {
      if (c != null && c.moveToFirst()) return c.getLong(0);
    } catch (Throwable ignored) {
      // treat as "unknown", cache will simply refresh more often
    }
    return -1;
  }

  private static String readAll(InputStream in) throws Exception {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    byte[] buf = new byte[16 * 1024];
    int n, total = 0;
    while ((n = in.read(buf)) > 0) {
      total += n;
      if (total > MAX_DB_BYTES) throw new IllegalStateException("recordings DB too large");
      out.write(buf, 0, n);
    }
    return out.toString(StandardCharsets.UTF_8.name());
  }

  /**
   * Stable opaque id for a recording. The dialer side only ever sees this, so a
   * malicious caller cannot turn the provider into an arbitrary-file reader.
   */
  private static String idOf(String audioUri) {
    try {
      MessageDigest md = MessageDigest.getInstance("SHA-256");
      byte[] h = md.digest(audioUri.getBytes(StandardCharsets.UTF_8));
      StringBuilder sb = new StringBuilder(32);
      for (int i = 0; i < 16; i++) sb.append(String.format(Locale.US, "%02x", h[i]));
      return sb.toString();
    } catch (Throwable t) {
      return Integer.toHexString(audioUri.hashCode());
    }
  }

  /** Digits only, used for the filename fallback match. */
  private static String digitsOf(String s) {
    if (s == null) return "";
    StringBuilder sb = new StringBuilder(s.length());
    for (int i = 0; i < s.length(); i++) {
      char ch = s.charAt(i);
      if (ch >= '0' && ch <= '9') sb.append(ch);
    }
    return sb.toString();
  }

  /**
   * Number comparison. PhoneNumberUtils.compare() handles the usual
   * +country-prefix / local-format mismatch; the digit-suffix check below is the
   * fallback for the filename listing, where "number" is every digit in the filename
   * (date included) rather than a real number.
   */
  private static boolean numbersMatch(String a, String b) {
    if (TextUtils.isEmpty(a) || TextUtils.isEmpty(b)) return false;
    if (PhoneNumberUtils.compare(a, b)) return true;
    String da = digitsOf(a), db = digitsOf(b);
    if (da.length() < 7) return da.equals(db);
    // last 7 digits identify a subscriber well enough for a local match
    return db.contains(da.substring(da.length() - 7));
  }

  private static String firstSegment(Uri uri) {
    List<String> segs = uri.getPathSegments();
    return segs.isEmpty() ? "" : segs.get(0);
  }

  private static long parseLong(String s, long def) {
    try {
      return s == null ? def : Long.parseLong(s);
    } catch (NumberFormatException e) {
      return def;
    }
  }

  //#endregion
}
