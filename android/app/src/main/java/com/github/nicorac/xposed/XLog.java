package com.github.nicorac.xposed;

import android.content.Context;

import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Logging for the dialer-side module.
 *
 * Three sinks, deliberately different in cost:
 *
 * <ul>
 *   <li><b>a ring buffer, always on.</b> The last few hundred lines are kept in
 *       memory. It costs nothing to keep and means a user who hits a problem can hand
 *       over the run-up to it without having had diagnostics enabled beforehand --
 *       which is the whole difficulty with a debug toggle: it is always off when the
 *       bug happens.</li>
 *   <li><b>logcat</b>, always, under {@link #TAG}. Android's own ring, useful over adb
 *       but not reachable from the phone itself.</li>
 *   <li><b>a file</b>, only when the user turns diagnostics on. Written to the host
 *       app's own external files dir, since the module runs in the dialer's process
 *       and holds no storage permission.</li>
 * </ul>
 *
 * The ring is what {@link RecordingsProvider} hands back to BCR-GUI for export, so a
 * report can be produced from the phone with no cable and no adb.
 */
public final class XLog {

  public static final String TAG = "BcrGuiXposed";
  public static final String LOG_FILENAME = "bcr-gui-xposed.log";

  /** Enough to cover a session's worth of interesting events, bounded in memory. */
  private static final int RING_SIZE = 400;

  /** Truncate the file once it grows past this, so it cannot fill the host's storage. */
  private static final long MAX_SIZE = 512 * 1024;

  private static final SimpleDateFormat TS =
    new SimpleDateFormat("MM-dd HH:mm:ss.SSS", Locale.US);

  private static final Object LOCK = new Object();
  private static final ArrayDeque<String> RING = new ArrayDeque<>(RING_SIZE);

  private static File logFile;
  private static boolean fileSinkTried;

  private XLog() {}

  /**
   * Bind the file sink to a host context. Only takes effect while diagnostics are on;
   * the ring buffer and logcat work regardless.
   */
  public static void attach(Context ctx) {
    synchronized (LOCK) {
      if (fileSinkTried || ctx == null) return;
      fileSinkTried = true;
      try {
        File dir = ctx.getExternalFilesDir(null);
        if (dir == null) dir = ctx.getCacheDir();
        if (dir != null && (dir.exists() || dir.mkdirs())) {
          logFile = new File(dir, LOG_FILENAME);
        }
      } catch (Throwable t) {
        android.util.Log.w(TAG, "cannot create log file", t);
      }
    }
  }

  /** Absolute path of the log file, or null when it is unavailable. */
  public static String getLogPath() {
    File f = logFile;
    return f != null ? f.getAbsolutePath() : null;
  }

  /** Everything currently in the ring, oldest first. */
  public static List<String> snapshot() {
    synchronized (LOCK) {
      return new ArrayList<>(RING);
    }
  }

  public static void i(String msg) { write("I", msg, null); }

  public static void w(String msg) { write("W", msg, null); }

  public static void w(String msg, Throwable t) { write("W", msg, t); }

  public static void e(String msg, Throwable t) { write("E", msg, t); }

  /**
   * Verbose tracing, kept out of the ring unless diagnostics are on: it fires per view
   * and would otherwise push everything else out of a buffer this size.
   */
  public static void d(String msg) {
    if (Diag.verbose) write("D", msg, null);
  }

  private static void write(String level, String msg, Throwable t) {

    String line = TS.format(new Date()) + " " + level + " " + msg;
    if (t != null) {
      StringWriter sw = new StringWriter();
      t.printStackTrace(new PrintWriter(sw));
      line += "\n" + sw;
    }

    synchronized (LOCK) {
      if (RING.size() >= RING_SIZE) RING.pollFirst();
      RING.addLast(line);
    }

    android.util.Log.println(
      "E".equals(level) ? android.util.Log.ERROR
        : "W".equals(level) ? android.util.Log.WARN
        : "D".equals(level) ? android.util.Log.DEBUG
        : android.util.Log.INFO,
      TAG, line);

    if (!Diag.verbose) return;   // file sink is opt-in

    File f = logFile;
    if (f == null) return;
    synchronized (LOCK) {
      try {
        if (f.length() > MAX_SIZE && !f.delete()) {
          logFile = null;
          return;
        }
        try (FileWriter fw = new FileWriter(f, true)) {
          fw.write(line);
          fw.write('\n');
        }
      } catch (Throwable ignored) {
        // never let logging break the host app
      }
    }
  }

  /** Toggles that only matter while diagnosing a device. */
  public static final class Diag {
    /** Mirrors BCR-GUI's diagnostics setting; also enables the file sink. */
    public static volatile boolean verbose = false;
    private Diag() {}
  }
}
