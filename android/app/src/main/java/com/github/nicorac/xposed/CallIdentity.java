package com.github.nicorac.xposed;

/**
 * What can be read off a call-log or history row before asking BCR-GUI anything.
 *
 * Filled in by whichever route succeeds -- the row's view-holder model, the instant
 * captured from the platform date formatter, or the digits in its label -- and then
 * used as the cache key for the recording lookup, which is why the key has to reflect
 * every field the answer depends on.
 */
final class CallIdentity {
  
    long[] callIds;
    String number = "";
    long date;
    /** Call length in seconds, read from the row. Tie-breaker only. */
    int durationSec;
    /** Day-of-month / hour / minute read off the row; day is -1 when not shown. */
    int rowDay = -1, rowHour = -1, rowMinute = -1;
    /** 0-based month from the row's label, -1 when it does not name one. */
    int rowMonth = -1;
    /** The row labels its day by weekday name, so the call is within the last week. */
    boolean rowWeekday;

    boolean hasRowTime() { return rowHour >= 0 && rowMinute >= 0; }

    String cacheKey() {
      if (date == 0 && hasRowTime()) {
        return number + "|t" + rowMonth + "/" + rowDay + ":" + rowHour + ":" + rowMinute;
      }
      if (durationSec > 0 && date == 0) return number + "|d" + durationSec;
      if (callIds != null && callIds.length > 0) return "id:" + callIds[0];
      return number + "|" + date;
    }
}
