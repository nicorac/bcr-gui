package com.github.nicorac.xposed;

import android.app.Application;
import android.content.Context;

import io.github.libxposed.api.XposedModule;
import io.github.libxposed.api.XposedModuleInterface;

/**
 * Xposed entry point, modern libxposed API (102).
 *
 * Declared alongside {@link XposedEntry}: a framework implementing libxposed uses
 * this one, anything older uses the legacy entry, and both drive the same dialer-side
 * code through {@link Hooks}. DialerHook.install() is idempotent, so a framework that
 * happens to offer both cannot install the hooks twice.
 *
 * Per the API contract the framework attaches itself and then calls onModuleLoaded,
 * so nothing is set up in the constructor.
 */
public class ModernEntry extends XposedModule {

  @Override
  public void onModuleLoaded(XposedModuleInterface.ModuleLoadedParam param) {
    XLog.i("modern entry loaded: " + getFrameworkName() + " " + getFrameworkVersion()
      + " (API " + getApiVersion() + ", module v" + XposedEntry.MODULE_VERSION + ")");
  }

  @Override
  public void onPackageLoaded(XposedModuleInterface.PackageLoadedParam param) {

    // Only the main package load matters; a package can be reported more than once.
    if (!param.isFirstPackage()) return;

    final String pkg = param.getPackageName();
    final ClassLoader loader = param.getDefaultClassLoader();
    XLog.i("onPackageLoaded: " + pkg + " (module v" + XposedEntry.MODULE_VERSION + ")");

    final Hooks hooks = new ModernHooks(this);

    if (DialerLink.APP_PACKAGE.equals(pkg)) {
      XposedEntry.hookSelfProbe(hooks, loader);
      return;
    }

    // Same shape as the legacy entry: wait for the Application so there is a Context
    // to read configuration and resolve the recordings provider with.
    java.lang.reflect.Method onCreate = Hooks.find("android.app.Instrumentation",
      loader, "callApplicationOnCreate", Application.class);
    if (onCreate == null) {
      XLog.e("cannot resolve Instrumentation.callApplicationOnCreate in " + pkg, null);
      return;
    }
    hooks.after(onCreate, (self, args, result) -> {
      try {
        DialerHook.install((Context) args[0], pkg, loader, hooks);
      } catch (Throwable t) {
        XLog.e("install failed in " + pkg, t);
      }
    });
  }
}
