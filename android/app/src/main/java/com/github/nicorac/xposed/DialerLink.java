package com.github.nicorac.xposed;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.telecom.TelecomManager;
import android.text.TextUtils;
import android.util.Log;

import com.github.nicorac.bcrgui.BuildConfig;

import org.json.JSONObject;

/**
 * Contract shared by the two sides of the dialer integration:
 *
 *  - {@link RecordingsProvider} runs in the BCR-GUI process. It is the only side with
 *    SAF access to the recordings directory and knowledge of the recordings DB.
 *  - the Xposed module runs inside the dialer process. It has no storage permission,
 *    so it asks the provider both "is there a recording for this call?" and for a
 *    readable file descriptor to play.
 *
 * Keep dependency-free: loaded by both processes.
 */
public final class DialerLink {

  /** Derived from the applicationId so a debug install does not clash with a release one. */
  public static final String AUTHORITY = BuildConfig.APPLICATION_ID + ".dialerlink";
  public static final Uri BASE_URI = Uri.parse("content://" + AUTHORITY);

  /** BCR-GUI package, i.e. the module APK the dialer-side code was loaded from. */
  public static final String APP_PACKAGE = BuildConfig.APPLICATION_ID;

  //#region paths

  /** {@code content://<authority>/lookup?number=..&at=..&window=..} */
  public static final String PATH_LOOKUP = "lookup";
  /** {@code content://<authority>/audio/<id>} -- openFile() only. */
  public static final String PATH_AUDIO = "audio";
  /** {@code content://<authority>/config} -- single row, see CFG_* columns. */
  public static final String PATH_CONFIG = "config";

  //#endregion

  //#region lookup query params

  /** Phone number of the call log row, in any format. */
  public static final String QP_NUMBER = "number";
  /** Call start, epoch ms. 0/absent means "any call with this number". */
  public static final String QP_AT = "at";
  /** Half-width of the accepted time window around {@link #QP_AT}, in ms. */
  public static final String QP_WINDOW = "window";

  /**
   * Recordings rarely start exactly at the call log timestamp: the recorder starts
   * when the call connects, the call log stamps when it began ringing. Two minutes
   * covers ringing plus clock skew without colliding with a different call.
   */
  public static final long DEFAULT_WINDOW_MS = 120_000L;

  //#endregion

  //#region lookup cursor columns

  public static final String COL_ID = "_id";
  /** Playable {@code content://<authority>/audio/<id>} uri. */
  public static final String COL_URI = "uri";
  public static final String COL_NAME = "name";
  public static final String COL_NUMBER = "number";
  /** Recording start, epoch ms. */
  public static final String COL_DATE = "date";
  /** Duration in seconds, 0 if unknown. */
  public static final String COL_DURATION = "duration";
  public static final String COL_MIME = "mime";
  /** "in", "out" or "" */
  public static final String COL_DIRECTION = "direction";

  public static final String[] LOOKUP_COLUMNS = {
    COL_ID, COL_URI, COL_NAME, COL_NUMBER, COL_DATE, COL_DURATION, COL_MIME, COL_DIRECTION,
  };

  //#endregion

  //#region config cursor columns

  /** 1 when the user enabled dialer integration in BCR-GUI settings. */
  public static final String CFG_ENABLED = "enabled";
  /** Seek step in seconds, mirrors the in-app player setting. */
  public static final String CFG_SEEK_TIME = "seekTime";
  /** Playback speed, mirrors the in-app player setting. */
  public static final String CFG_PLAYBACK_SPEED = "playbackSpeed";
  /** 1 when the user asked for verbose logging (BCR-GUI developer mode). */
  public static final String CFG_VERBOSE = "verbose";
  /**
   * Localized label for the injected button. The module runs inside the dialer, so it
   * resolves the dialer's resources, not ours -- the string has to be handed over.
   */
  public static final String CFG_PLAY_LABEL = "playLabel";

  public static final String[] CONFIG_COLUMNS = {
    CFG_ENABLED, CFG_SEEK_TIME, CFG_PLAYBACK_SPEED, CFG_VERBOSE, CFG_PLAY_LABEL,
  };

  //#endregion

  public static Uri lookupUri(String number, long atMs) {
    return BASE_URI.buildUpon()
      .appendPath(PATH_LOOKUP)
      .appendQueryParameter(QP_NUMBER, number == null ? "" : number)
      .appendQueryParameter(QP_AT, Long.toString(atMs))
      .build();
  }

  public static Uri audioUri(String id) {
    return BASE_URI.buildUpon().appendPath(PATH_AUDIO).appendPath(id).build();
  }

  public static Uri configUri() {
    return BASE_URI.buildUpon().appendPath(PATH_CONFIG).build();
  }

  //#region app-side helpers (BCR-GUI process only)

  /** Capacitor Preferences stores everything in this SharedPreferences group. */
  public static final String PREFS_NAME = "CapacitorStorage";
  public static final String PREFS_KEY_SETTINGS = "settings";

  private static final String TAG = "BcrGuiDialerLink";

  //#region diagnostics channel

  /**
   * Provider call() that hands the module's ring buffer to BCR-GUI.
   *
   * The module runs in the dialer's process and writes its file into the dialer's own
   * storage, which the app cannot read on Android 11+. Pushing the buffer across is
   * what lets a user export a report from the phone, with no cable and no adb.
   */
  public static final String METHOD_PUSH_DIAGNOSTICS = "pushDiagnostics";
  public static final String EXTRA_LINES = "lines";
  public static final String EXTRA_SOURCE = "source";

  /** File the app collects pushed diagnostics into, inside its own files dir. */
  public static final String DIAGNOSTICS_FILE = "dialer-diagnostics.log";

  //#endregion

  /** Kept out of CapacitorStorage: written by the provider, read by the app. */
  public static final String LINK_PREFS = "bcrgui-dialer-link";
  public static final String KEY_LAST_DIALER_CONTACT = "lastDialerContact";

  /** Package of the device's current default dialer, or null. */
  public static String defaultDialer(Context ctx) {
    try {
      TelecomManager tm = (TelecomManager) ctx.getSystemService(Context.TELECOM_SERVICE);
      return tm != null ? tm.getDefaultDialerPackage() : null;
    } catch (Throwable t) {
      Log.w(TAG, "cannot read default dialer", t);
      return null;
    }
  }

  /** Raw settings JSON written by the app's TypeScript layer, never null. */
  public static JSONObject readSettingsJson(Context ctx) {
    try {
      SharedPreferences prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
      String json = prefs.getString(PREFS_KEY_SETTINGS, null);
      if (json != null) return new JSONObject(json);
    } catch (Throwable t) {
      Log.w(TAG, "cannot read settings", t);
    }
    return new JSONObject();
  }

  /**
   * Make BCR-GUI reachable from the dialer process.
   *
   * On Android 11+ the dialer cannot even resolve our authority: package visibility
   * hides us unless its manifest declares a matching &lt;queries&gt; entry, which we
   * obviously cannot add to someone else's app. Granting the dialer a URI permission
   * on our provider triggers the "app that has been granted URI permissions" rule and
   * makes BCR-GUI visible to it.
   *
   * Grants do not survive a reboot, so this runs on every app start. It is a no-op
   * while the user has not enabled the integration, and RecordingsProvider still
   * checks every caller regardless of any grant.
   */
  public static void grantToDefaultDialer(Context ctx) {

    if (!readSettingsJson(ctx).optBoolean("dialerIntegrationEnabled", false)) {
      return;
    }
    String dialer = defaultDialer(ctx);
    if (TextUtils.isEmpty(dialer) || BuildConfig.APPLICATION_ID.equals(dialer)) {
      return;
    }
    try {
      ctx.grantUriPermission(dialer, BASE_URI,
        Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
      Log.i(TAG, "granted read access on " + BASE_URI + " to " + dialer);
    } catch (Throwable t) {
      Log.w(TAG, "cannot grant uri permission to " + dialer, t);
    }
  }

  //#endregion

  private DialerLink() {}
}
