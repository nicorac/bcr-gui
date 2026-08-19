package com.github.nicorac.xposed;

import java.lang.reflect.Method;

import io.github.libxposed.api.XposedInterface;

/**
 * {@link Hooks} on the modern libxposed API (102).
 *
 * The modern API models a hook as an interceptor around the original call rather than
 * as before/after callbacks, so "run afterwards" is expressed by proceeding first and
 * then reporting, and "replace" by not proceeding at all.
 *
 * This class must only be loaded when a framework implementing that API is present;
 * referencing it elsewhere would fail to resolve io.github.libxposed.
 */
final class ModernHooks extends Hooks {

  private final XposedInterface xposed;

  ModernHooks(XposedInterface xposed) {
    this.xposed = xposed;
  }

  @Override
  void after(Method method, After callback) {
    xposed.hook(method).intercept(chain -> {
      Object result = chain.proceed();
      try {
        callback.run(chain.getThisObject(), chain.getArgs().toArray(), result);
      } catch (Throwable ignored) {
        // a hook of ours must never surface as a failure of the host's method
      }
      return result;
    });
  }

  @Override
  void replace(Method method, Object value) {
    xposed.hook(method).intercept(chain -> value);
  }

  @Override
  String describe() {
    return xposed.getFrameworkName() + " " + xposed.getFrameworkVersion()
      + " (libxposed API " + xposed.getApiVersion() + ")";
  }
}
