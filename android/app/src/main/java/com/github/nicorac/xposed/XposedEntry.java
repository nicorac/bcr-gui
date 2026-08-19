package com.github.nicorac.xposed;

import android.app.Application;
import android.content.Context;

import de.robv.android.xposed.IXposedHookLoadPackage;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedHelpers;
import de.robv.android.xposed.callbacks.XC_LoadPackage;

/**
 * Xposed entry point, legacy XposedBridge API.
 *
 * Declared alongside the modern one in {@link ModernEntry}: frameworks that implement
 * libxposed 102 use that, and anything older still loads this. Both call the same
 * dialer-side code through {@link Hooks}, and DialerHook.install() is idempotent, so
 * a framework offering both cannot hook twice.
 *
 * BCR-GUI's own APK is the module; there is no second app to install. In BCR-GUI's
 * process this only flips {@link ModuleStatus}; in a dialer process it installs
 * {@link DialerHook}.
 */
public class XposedEntry implements IXposedHookLoadPackage {

  /** Bumped when the dialer-side code changes, so a stale module in a host is visible. */
  public static final String MODULE_VERSION = "1";

  @Override
  public void handleLoadPackage(final XC_LoadPackage.LoadPackageParam lpparam) {

    // Unconditional, before every gate below: this is the only proof that the module
    // was loaded at all. Without it, "module never loaded" and "module loaded but
    // bailed out" look identical from the outside.
    XLog.i("handleLoadPackage: " + lpparam.packageName
      + " (module v" + MODULE_VERSION + ", app=" + DialerLink.APP_PACKAGE + ")");

    // BCR-GUI itself: report back that the module is loaded and enabled for us.
    if (DialerLink.APP_PACKAGE.equals(lpparam.packageName)) {
      hookSelfProbe(new LegacyHooks(), lpparam.classLoader);
      return;
    }

    // Any other process we were scoped to is treated as a candidate dialer. The
    // decision is deliberately left to the scope the user picked in their Xposed
    // manager, so third-party dialers work without a hardcoded package list;
    // DialerHook.install() bails out if the process is clearly not a dialer.
    try {
      XposedHelpers.findAndHookMethod("android.app.Instrumentation", lpparam.classLoader,
        "callApplicationOnCreate", Application.class, new XC_MethodHook() {
          @Override
          protected void afterHookedMethod(MethodHookParam param) {
            try {
              Context app = (Context) param.args[0];
              XLog.i("application created: " + lpparam.packageName);
              DialerHook.install(app, lpparam.packageName, lpparam.classLoader,
                new LegacyHooks());
            } catch (Throwable t) {
              XLog.e("install failed in " + lpparam.packageName, t);
            }
          }
        });
    } catch (Throwable t) {
      XLog.e("cannot hook Instrumentation in " + lpparam.packageName, t);
    }
  }

  /**
   * Make {@link ModuleStatus#isModuleActive()} return true inside BCR-GUI.
   *
   * That is the whole activation check: it can only succeed if a framework is
   * installed AND the user enabled BCR-GUI as a module AND scoped it to BCR-GUI
   * itself. Shared with the modern entry point; only the Hooks implementation differs.
   */
  static void hookSelfProbe(Hooks hooks, ClassLoader loader) {
    java.lang.reflect.Method active =
      Hooks.find(ModuleStatus.class.getName(), loader, "isModuleActive");
    java.lang.reflect.Method version =
      Hooks.find(ModuleStatus.class.getName(), loader, "getModuleVersion");
    if (active != null) hooks.replace(active, true);
    if (version != null) hooks.replace(version, MODULE_VERSION);
  }

}
