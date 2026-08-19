package com.github.nicorac.xposed;

import java.lang.reflect.Method;

import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XC_MethodReplacement;
import de.robv.android.xposed.XposedBridge;

/**
 * {@link Hooks} on the original XposedBridge API.
 *
 * Kept alongside the modern implementation rather than replaced by it: this one is
 * accepted by every framework in circulation, so a device whose framework does not
 * implement libxposed 102 still gets the feature.
 */
final class LegacyHooks extends Hooks {

  @Override
  void after(Method method, After callback) {
    XposedBridge.hookMethod(method, new XC_MethodHook() {
      @Override
      protected void afterHookedMethod(MethodHookParam param) {
        callback.run(param.thisObject, param.args, param.getResult());
      }
    });
  }

  @Override
  void replace(Method method, Object value) {
    XposedBridge.hookMethod(method, XC_MethodReplacement.returnConstant(value));
  }

  @Override
  String describe() {
    return "XposedBridge (legacy API)";
  }
}
