package com.github.nicorac.xposed;

import android.content.Context;
import android.database.Cursor;
import android.provider.CallLog;
import android.text.TextUtils;

/**
 * Everything the dialer side asks BCR-GUI.
 *
 * All access to the recordings provider lives here: the configuration poll, the
 * lookups that pair a call with a recording, and the caches in front of both. The
 * decoration code never talks to the provider directly, which keeps the question
 * "which recording is this?" separate from "what should this row look like?".
 *
 * Callable from any thread; the lookups are meant for a worker.
 */
final class RecordingIndex {

  private static Context ctx;

  static void attach(Context context) {
    ctx = context;
  }

  /** Last configuration read, and when. Polled rather than pushed, see readConfig(). */
  private static volatile Config config = Config.DISABLED;
  private static volatile long configReadAt;

  //#region lookups

  static final class Match {
    /** The lookup could not be completed; the answer is unknown, not negative. */
    boolean failed;
    String playUri;
    String name = "";
    long date;
    int duration;
  }

  static Match doLookup(CallIdentity raw) {


    String number = raw.number;
    long date = raw.date;

    // Exact identification when the holder gave us call-log row ids: the dialer holds
    // READ_CALL_LOG, so the authoritative number and timestamp are one query away.
    if (raw.callIds != null && ctx != null) {
      StringBuilder in = new StringBuilder();
      for (long l : raw.callIds) {
        if (in.length() > 0) in.append(',');
        in.append(l);
      }
      String[] cols = { CallLog.Calls.NUMBER, CallLog.Calls.DATE };
      try (Cursor c = ctx.getContentResolver().query(CallLog.Calls.CONTENT_URI, cols,
        CallLog.Calls._ID + " IN (" + in + ")", null, CallLog.Calls.DATE + " DESC")) {
        if (c != null && c.moveToFirst()) {
          number = c.getString(0);
          date = c.getLong(1);
        }
      } catch (Throwable t) {
        XLog.w("call log query failed", t);
      }
    }

    Match miss = new Match();
    if (TextUtils.isEmpty(number) || ctx == null) return miss;

    if (date == 0 && raw.hasRowTime()) {
      return lookupByRowTime(number, raw);
    }
    if (raw.durationSec > 0 && date == 0) {
      return lookupByDuration(number, raw.durationSec);
    }

    try (Cursor c = ctx.getContentResolver().query(
      DialerLink.lookupUri(number, date), null, null, null, null)) {
      if (c != null && c.moveToFirst()) {
        Match m = new Match();
        m.playUri = c.getString(c.getColumnIndexOrThrow(DialerLink.COL_URI));
        m.name = c.getString(c.getColumnIndexOrThrow(DialerLink.COL_NAME));
        m.date = c.getLong(c.getColumnIndexOrThrow(DialerLink.COL_DATE));
        m.duration = c.getInt(c.getColumnIndexOrThrow(DialerLink.COL_DURATION));
        if (Diag.budget("lookup:" + Diag.mask(number), 4)) {
          XLog.i("MATCH for " + Diag.mask(number) + " @" + date + " -> " + Diag.mask(m.name));
        }
        return m;
      }
      if (Diag.budget("lookup:" + Diag.mask(number), 4)) {
        XLog.i("no recording for " + Diag.mask(number) + " @" + date
          + " (window " + DialerLink.DEFAULT_WINDOW_MS + "ms)");
      }
    } catch (SecurityException e) {
      XLog.w("provider refused the lookup: " + e.getMessage());
      miss.failed = true;
    } catch (Throwable t) {
      XLog.w("lookup failed", t);
      miss.failed = true;
    }
    return miss;
  }

  /**
   * Pair a history row with a recording by when the call happened.
   *
   * Rather than parsing the row's localised date text, each candidate recording's own
   * timestamp is broken into day, hour and minute in the device's timezone and
   * compared with the digits shown. That sidesteps month names, date order and
   * timezone conversion entirely, and unlike matching on call length it works for
   * recordings the app has not indexed yet -- those have no duration at all.
   */
  static Match lookupByRowTime(String number, CallIdentity raw) {

    Match best = null;
    int fits = 0;
    boolean h24 = ctx == null || android.text.format.DateFormat.is24HourFormat(ctx);

    try (Cursor c = ctx.getContentResolver().query(
      DialerLink.lookupUri(number, 0), null, null, null, null)) {
      java.util.Calendar cal = java.util.Calendar.getInstance();
      while (c != null && c.moveToNext()) {
        long when = c.getLong(c.getColumnIndexOrThrow(DialerLink.COL_DATE));
        if (when <= 0) continue;
        cal.setTimeInMillis(when);
        int day = cal.get(java.util.Calendar.DAY_OF_MONTH);
        int hour = cal.get(java.util.Calendar.HOUR_OF_DAY);
        int minute = cal.get(java.util.Calendar.MINUTE);

        if (raw.rowDay >= 0 && raw.rowDay != day) continue;
        if (raw.rowMonth >= 0 && raw.rowMonth != cal.get(java.util.Calendar.MONTH)) continue;
        // No month and no day means the row labelled it by time alone (today) or by
        // weekday (within the past week); either way an older call cannot be it.
        if (raw.rowDay < 0) {
          long age = System.currentTimeMillis() - when;
          if (age > (raw.rowWeekday ? 8L : 1L) * 86_400_000L) continue;
        }
        boolean hourOk = hour == raw.rowHour
          || (!h24 && (hour % 12) == (raw.rowHour % 12));
        // a recording starts when the call connects, so allow a minute of drift
        if (!hourOk || Math.abs(minute - raw.rowMinute) > 1) continue;

        fits++;
        if (best == null) {
          best = new Match();
          best.playUri = c.getString(c.getColumnIndexOrThrow(DialerLink.COL_URI));
          best.name = c.getString(c.getColumnIndexOrThrow(DialerLink.COL_NAME));
          best.date = when;
          best.duration = c.getInt(c.getColumnIndexOrThrow(DialerLink.COL_DURATION));
        }
      }
    } catch (Throwable t) {
      XLog.w("row-time lookup failed", t);
      Match failure = new Match();
      failure.failed = true;
      return failure;
    }

    if (Diag.budget("rowtime-lookup", 20)) {
      String outcome = fits == 0 ? "no candidate"
        : fits > 1 ? "ambiguous (" + fits + ")"
        : "match " + new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm",
            java.util.Locale.US).format(new java.util.Date(best.date));
      XLog.i("row-time lookup " + Diag.mask(number) + " month=" + raw.rowMonth
        + " day=" + raw.rowDay + " " + raw.rowHour + ":" + raw.rowMinute
        + (raw.rowWeekday ? " (weekday)" : "") + " -> " + outcome);
    }
    return fits == 1 ? best : new Match();
  }

  /**
   * Pair a history row with a recording by call length.
   *
   * A single digit run in the label is ambiguous between seconds and minutes, so both
   * readings are tried. If more than one recording fits, nothing is returned: showing
   * a button that plays the wrong call is worse than showing none.
   */
  static Match lookupByDuration(String number, int seconds) {

    Match best = null;
    int bestDelta = Integer.MAX_VALUE;
    int fits = 0;

    try (Cursor c = ctx.getContentResolver().query(
      DialerLink.lookupUri(number, 0), null, null, null, null)) {
      while (c != null && c.moveToNext()) {
        int recorded = c.getInt(c.getColumnIndexOrThrow(DialerLink.COL_DURATION));
        if (recorded <= 0) continue;
        // recording starts when the call connects, so it runs a touch short
        int delta = Math.min(Math.abs(recorded - seconds), Math.abs(recorded - seconds * 60));
        if (delta > DURATION_TOLERANCE_SEC) continue;
        fits++;
        if (delta < bestDelta) {
          bestDelta = delta;
          Match m = new Match();
          m.playUri = c.getString(c.getColumnIndexOrThrow(DialerLink.COL_URI));
          m.name = c.getString(c.getColumnIndexOrThrow(DialerLink.COL_NAME));
          m.date = c.getLong(c.getColumnIndexOrThrow(DialerLink.COL_DATE));
          m.duration = recorded;
          best = m;
        }
      }
    } catch (Throwable t) {
      XLog.w("duration lookup failed", t);
      Match failure = new Match();
      failure.failed = true;
      return failure;
    }

    boolean ambiguous = fits > 1 && bestDelta > 1;
    if (Diag.budget("duration-lookup", 20)) {
      XLog.i("duration lookup " + Diag.mask(number) + " " + seconds + "s -> "
        + (best == null ? "no candidate" : (ambiguous ? "ambiguous (" + fits + ")"
          : "match delta=" + bestDelta + "s")));
    }
    return ambiguous || best == null ? new Match() : best;
  }

  /** How far a recording's length may sit from the call's and still be the one. */
  private static final int DURATION_TOLERANCE_SEC = 3;

  //#endregion
  //#region config

  static final class Config {
    static final Config DISABLED = new Config();
    /** false when the provider could not be reached at all (vs. reached and disabled). */
    boolean readOk;
    boolean enabled;
    int seekTime = 10;
    float playbackSpeed = 1f;
    boolean verbose;
    /** Fallback only; the real, translated label comes from BCR-GUI. */
    String playLabel = "Play";
  }

  /** Cached for a minute so toggling in BCR-GUI takes effect without a reboot. */
  static Config readConfig() {
    long now = System.currentTimeMillis();
    Config c = config;
    // The cache also covers the disabled case now: decorateList() asks on every
    // layout, and an uncached miss there would mean a provider query per frame.
    if (now - configReadAt < 60_000L) return c;
    if (ctx == null) return Config.DISABLED;

    Config res = new Config();
    XLog.d("querying " + DialerLink.configUri());
    try (Cursor cur = ctx.getContentResolver()
      .query(DialerLink.configUri(), null, null, null, null)) {
      if (cur == null) {
        XLog.w("config query returned no cursor for " + DialerLink.configUri()
          + " -- the authority is not visible to this process");
        config = Config.DISABLED;
        configReadAt = now;
        return Config.DISABLED;
      }
      if (cur.moveToFirst()) {
        res.readOk = true;
        res.enabled = cur.getInt(cur.getColumnIndexOrThrow(DialerLink.CFG_ENABLED)) == 1;
        res.seekTime = cur.getInt(cur.getColumnIndexOrThrow(DialerLink.CFG_SEEK_TIME));
        res.playbackSpeed =
          (float) cur.getDouble(cur.getColumnIndexOrThrow(DialerLink.CFG_PLAYBACK_SPEED));
        res.verbose = cur.getInt(cur.getColumnIndexOrThrow(DialerLink.CFG_VERBOSE)) == 1;
        String label = cur.getString(cur.getColumnIndexOrThrow(DialerLink.CFG_PLAY_LABEL));
        if (!TextUtils.isEmpty(label)) res.playLabel = label;
      }
    } catch (Throwable t) {
      // Most likely causes, in order: BCR-GUI not installed; the integration never
      // enabled (so no URI grant was ever issued and package visibility hides the
      // authority); or this app is not the current default dialer.
      if (Diag.once("config-unreadable")) {
        XLog.w("cannot read config from BCR-GUI -- check it is installed, that the"
          + " integration is enabled in its settings, and that this app is the"
          + " default dialer", t);
      }
      config = Config.DISABLED;
      configReadAt = now;
      return Config.DISABLED;
    }
    XLog.Diag.verbose = res.verbose;
    if (res.seekTime <= 0) res.seekTime = 10;
    if (res.playbackSpeed <= 0) res.playbackSpeed = 1f;
    String line = "config: readOk=" + res.readOk + " enabled=" + res.enabled
      + " seekTime=" + res.seekTime;
    if (Diag.once(line)) XLog.i(line);
    config = res;
    configReadAt = now;
    return res;
  }


  //#endregion
}
