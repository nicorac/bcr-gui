package com.github.nicorac.xposed;

import java.lang.reflect.Method;

/**
 * The two hooking operations this module needs, independent of framework API.
 *
 * The dialer-side code is identical whichever API is in play, so it takes one of these
 * rather than calling a framework directly. That is what lets the same module declare
 * both a legacy XposedBridge entry point and a modern libxposed one: only the
 * implementation behind this differs.
 *
 * Methods are resolved by the caller and passed in, because both APIs accept a
 * {@link Method} and neither needs its own lookup helpers.
 */
abstract class Hooks {

  /** Called after the hooked method ran, with everything it saw. */
  interface After {
    void run(Object thisObject, Object[] args, Object result);
  }

  /** Run {@code callback} after {@code method} returns, leaving its result alone. */
  abstract void after(Method method, After callback);

  /** Replace {@code method} entirely, returning {@code value} without running it. */
  abstract void replace(Method method, Object value);

  /** Framework name and version, for the log. */
  abstract String describe();

  //#region method resolution

  /** @return the method, or null when this platform does not have it. */
  static Method find(String className, ClassLoader loader, String methodName,
                     Class<?>... parameterTypes) {
    try {
      Class<?> cls = Class.forName(className, false,
        loader != null ? loader : Hooks.class.getClassLoader());
      Method m = cls.getDeclaredMethod(methodName, parameterTypes);
      m.setAccessible(true);
      return m;
    } catch (Throwable t) {
      return null;
    }
  }

  static Method find(Class<?> cls, String methodName, Class<?>... parameterTypes) {
    try {
      Method m = cls.getDeclaredMethod(methodName, parameterTypes);
      m.setAccessible(true);
      return m;
    } catch (Throwable t) {
      return null;
    }
  }

  //#endregion
}
