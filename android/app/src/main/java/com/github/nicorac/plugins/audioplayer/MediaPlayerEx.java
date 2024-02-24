package com.github.nicorac.plugins.audioplayer;

import static android.content.Context.NOTIFICATION_SERVICE;

import android.annotation.SuppressLint;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import com.github.nicorac.bcrgui.R;

/**
 * Wrapper class to keep data of each media player instance together
 */
public class MediaPlayerEx {

  private static final int UPDATE_INTERVAL = 300;
  private static final String NOTIFICATION_CHANNEL_ID = "BCR-GUI";
  private static final String NOTIFICATION_CHANNEL_NAME = "BCR-GUI - Play status";

  private final Context context;
  public final int id;
  public final String title;
  public final String text;
  private final android.media.MediaPlayer player;
  @Nullable
  public androidx.core.app.NotificationCompat.Builder notificationBuilder = null;

  // events and update handler
  private final Handler handler = new Handler(Looper.getMainLooper());
  private Runnable updateRunnable;
  private final OnEventListener eventListener;

  // notification management
  private static NotificationManager notificationManager;
  private boolean isNotificationVisible = false;

  MediaPlayerEx(Context context, Uri fileUri, String title, String text, OnEventListener listener) {
    this.context = context;
    this.id = fileUri.hashCode();
    this.title = title;
    this.text = text;
    this.eventListener = listener;

    // get instance of NotificationManager and create notifications channel
    if (notificationManager == null) {
      notificationManager = (NotificationManager) context.getSystemService(NOTIFICATION_SERVICE);
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        var channel = new NotificationChannel(
          NOTIFICATION_CHANNEL_ID,
          NOTIFICATION_CHANNEL_NAME,
          NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setImportance(NotificationManager.IMPORTANCE_LOW);  // needed to disable vibration!
        channel.enableVibration(false);
        notificationManager.createNotificationChannel(channel);
      }
    }

    // init a new notification builder
    notificationBuilder = new androidx.core.app.NotificationCompat.Builder(context, NOTIFICATION_CHANNEL_ID);

    // create MediaPlayer instance
    player = android.media.MediaPlayer.create(context, fileUri);
    player.setLooping(false);

    // attach completion handler
    player.setOnCompletionListener(mp -> {
      stopUpdateTask();
      cancelNotification();
      this.eventListener.onCompletion(this);
    });
  }

  // export player methods

  public void start() {
    startUpdateTask();
    createNotification();
    player.start();
  }

  public void pause() {
    stopUpdateTask();
    cancelNotification();
    player.pause();
  }

  public void stop() {
    stopUpdateTask();
    cancelNotification();
    player.stop();
  }

  public void release() {
    stop();
    player.release();
  }

  public boolean isPlaying() { return player.isPlaying(); }
  public void seekTo(int position) { player.seekTo(position); }
  public int getDuration() { return player.getDuration(); }
  public String getDurationHMS() { return toHMS(player.getDuration()); }
  public int getCurrentPosition() { return player.getCurrentPosition(); }
  public String getCurrentPositionHMS() { return toHMS(player.getCurrentPosition()); }

  /**
   * Start an update task (each UPDATE_INTERVAL ms) to update notification text
   */
  private void startUpdateTask() {

    updateRunnable = new Runnable() {
      @Override
      public void run() {
        doUpdate();
        // Post the same runnable again after UPDATE_INTERVAL ms
        handler.postDelayed(this, UPDATE_INTERVAL);
      }
    };
    // first trigger
    doUpdate();
    handler.postDelayed(updateRunnable, UPDATE_INTERVAL);
  }

  /**
   * Stop the existing update task
   */
  private void stopUpdateTask() {
    if (updateRunnable != null) {
      handler.removeCallbacks(updateRunnable);
      updateRunnable = null;
    }
    doUpdate();
  }

  private void doUpdate() {
    eventListener.onUpdate(MediaPlayerEx.this);
    updateNotification();
  }

  @SuppressLint("DefaultLocale")
  private String toHMS(int milliseconds) {
    long hours = milliseconds / (1000 * 60 * 60);
    milliseconds %= (1000 * 60 * 60);
    long minutes = milliseconds / (1000 * 60);
    milliseconds %= (1000 * 60);
    long seconds = milliseconds / 1000;
    if (hours > 0) {
      return String.format("%02d:%02d:%02d", hours, minutes, seconds);
    }
    else {
      return String.format("%02d:%02d", minutes, seconds);
    }
  }

  /**
   * Create notification
   */
  private void createNotification() {

    if (isNotificationVisible) {
      cancelNotification();
    }

    notificationBuilder
      .setContentTitle(title)
      .setSmallIcon(R.drawable.ic_notification)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .setContentIntent(this.eventListener.getNotificationClickIntent())
      .setVibrate(new long[]{0L})
      // Set as "persistent"
      //.setOngoing(true)
    ;

    updateNotification();
    isNotificationVisible = true;
  }

  /**
   * Update existing notification
   */
  public void updateNotification() {
    if (isNotificationVisible) {
      notificationBuilder.setContentText(getCurrentPositionHMS() + " / " + getDurationHMS());
      // set/update the notification
      notificationManager.notify(id, notificationBuilder.build());
    }
  }

  /**
   * Cancel existing notification
   */
  public void cancelNotification() {
    notificationManager.cancel(id);
    isNotificationVisible = false;
  }

}

