package com.github.nicorac.plugins.audioplayer;

import android.app.PendingIntent;

public interface OnEventListener {

  /**
   * Called during play to update status
   */
  void onUpdate(MediaPlayerEx mp);

  /*
   * Called when the end of a media source is reached during playback.
   */
  void onCompletion(MediaPlayerEx mp);

  /*
   * Intent called when user clicks on notification
   */
  PendingIntent getNotificationClickIntent();
}
