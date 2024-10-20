package com.github.nicorac.plugins.audioplayer;

import android.app.PendingIntent;

public interface OnEventListener {

  /**
   * Called when player is initialized
   */
  void onPlayerReady(MediaPlayerEx mp);

  /**
   * Called during play to update status
   */
  void onPlayerUpdate(MediaPlayerEx mp);

  /*
   * Called when the end of a media source is reached during playback.
   */
  void onPlayerCompleted(MediaPlayerEx mp);

  /*
   * Intent called when user clicks on notification
   */
  PendingIntent getNotificationClickIntent();
}
