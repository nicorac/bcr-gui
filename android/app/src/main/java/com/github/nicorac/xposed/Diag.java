package com.github.nicorac.xposed;

import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Rate limiting and redaction for the module's diagnostics.
 *
 * Both exist because of how this code had to be debugged: on someone's own phone,
 * through logs they send on. Two rules came out of that and are worth keeping.
 *
 * <p><b>Budget by content, not by call.</b> A scrolling list re-evaluates the same rows
 * every frame, so a counter of calls is spent on whichever screen was opened first and
 * the interesting one produces nothing at all.
 *
 * <p><b>Redact words, keep digits.</b> A row's label carries dates, times and durations
 * and never a phone number, and those digits are exactly what a wrong match has to be
 * judged on. Numbers and contact names are masked; everything else stays readable.
 */
final class Diag {

  private static final Map<String, Integer> BUDGETS = new HashMap<>();
  private static final Set<String> LOGGED_ONCE = Collections.synchronizedSet(new HashSet<>());

  /** True for the first {@code max} calls on this topic. */
  static boolean budget(String topic, int max) {
    synchronized (BUDGETS) {
      Integer n = BUDGETS.get(topic);
      int used = n == null ? 0 : n;
      if (used >= max) return false;
      BUDGETS.put(topic, used + 1);
      return true;
    }
  }

  /** True the first time this exact line is seen, bounded overall. */
  static boolean once(String message) {
    return LOGGED_ONCE.size() < 400 && LOGGED_ONCE.add(message);
  }

  /** Keep the shape of a number or name, drop the content. */
  static String mask(String s) {
    if (s == null) return "null";
    if (s.length() > 40) s = s.substring(0, 40) + "...";
    StringBuilder sb = new StringBuilder(s.length());
    int digits = 0;
    for (int i = 0; i < s.length(); i++) if (Character.isDigit(s.charAt(i))) digits++;
    int shown = 0;
    for (int i = 0; i < s.length(); i++) {
      char ch = s.charAt(i);
      if (Character.isDigit(ch)) {
        sb.append(++shown > digits - 3 ? ch : '*');
      } else if (Character.isLetter(ch)) {
        sb.append('x');
      } else {
        sb.append(ch);
      }
    }
    return sb.toString();
  }

  /** Mask words but keep digits: for labels, whose digits are the evidence. */
  static String maskLetters(String s) {
    if (s == null) return "null";
    StringBuilder sb = new StringBuilder(s.length());
    for (int i = 0; i < s.length(); i++) {
      char ch = s.charAt(i);
      sb.append(Character.isLetter(ch) ? 'x' : ch);
    }
    return sb.toString();
  }

  private Diag() {}
}
