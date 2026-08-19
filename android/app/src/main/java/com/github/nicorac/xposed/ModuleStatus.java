package com.github.nicorac.xposed;

/**
 * Self-activation probe.
 *
 * {@link #isModuleActive()} always returns false as compiled. When BCR-GUI is enabled
 * as an Xposed module, {@link XposedEntry} hooks this method inside BCR-GUI's own
 * process and makes it return true. So the app can tell "framework installed AND
 * module enabled for me" without talking to any manager app.
 *
 * Keep this class free of any dependency: it is loaded both by the app and by the
 * module code running inside the dialer process.
 */
public final class ModuleStatus {

  private ModuleStatus() {}

  /** Replaced by the Xposed hook. Do not inline, do not simplify. */
  public static boolean isModuleActive() {
    return false;
  }

  /**
   * Version of the module code that answered {@link #isModuleActive()}.
   * Lets the app warn when a stale module is still loaded in the dialer after an
   * app update (Xposed keeps the old dex until the host process restarts).
   */
  public static String getModuleVersion() {
    return "";
  }
}
