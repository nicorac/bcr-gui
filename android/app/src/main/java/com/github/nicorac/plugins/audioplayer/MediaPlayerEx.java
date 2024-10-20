package com.github.nicorac.plugins.audioplayer;

import static android.content.Context.NOTIFICATION_SERVICE;

import android.annotation.SuppressLint;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import androidx.media3.common.AudioAttributes;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;

import com.github.nicorac.bcrgui.R;

/**
 * Wrapper class to keep data of each media player instance together
 */
public class MediaPlayerEx {

  private static final int UPDATE_INTERVAL = 500;
  private static final String NOTIFICATION_CHANNEL_ID = "BCR-GUI";
  private static final String NOTIFICATION_CHANNEL_NAME = "BCR-GUI - Play status";

  public final Context context;
  public final Uri fileUri;
  public final int id;
  public final String title;
  public final String text;
  private OutputDeviceEnum device;
  private ExoPlayer player;
  private boolean isPreparing = false;
  private final AudioManager audioManager;
  @Nullable
  public androidx.core.app.NotificationCompat.Builder notificationBuilder;

  // events and update handler (in current "CapacitorPlugins" thread)
  private final Handler handler = new Handler();
  private Runnable updateRunnable;
  private final OnEventListener eventListener;

  // notification management
  private static NotificationManager notificationManager;
  private boolean isNotificationVisible = false;


  MediaPlayerEx(Context context, Uri fileUri, String title, String text, OnEventListener listener, OutputDeviceEnum device) {

    this.context = context;
    this.fileUri = fileUri;
    this.id = fileUri.hashCode();
    this.title = title;
    this.text = text;
    this.device = device;
    this.eventListener = listener;

    audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);

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
    initializePlayer();

  }

  /**
   * Initialize the MediaPlayer instance
   */
  private void initializePlayer() {

    // release previous player (if any)
    if (player != null) {
      player.release();
      player = null;
    }

    player = new ExoPlayer.Builder(context).build();
    AudioAttributes audioAttributes;

    // change device
    switch (device) {

      case Earpiece:
        // Switch to earpiece
        audioManager.setSpeakerphoneOn(false);
        audioAttributes = new AudioAttributes.Builder()
          .setUsage(C.USAGE_VOICE_COMMUNICATION)
          .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
          .build();
        break;

      default: // it means ==> Loudspeaker
        // Switch to loudspeaker
        audioManager.setSpeakerphoneOn(true);
        audioAttributes = new AudioAttributes.Builder()
          .setUsage(C.USAGE_MEDIA)
          .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
          .build();
        break;
    }

    try {
      player.setAudioAttributes(audioAttributes, false);
      var mediaItem = MediaItem.fromUri(fileUri);
      player.setMediaItem(mediaItem);
      isPreparing = true;
      player.prepare();
    } catch (Exception e) {
      throw new RuntimeException(e);
    }

    player.addListener(new Player.Listener() {
      @Override
      public void onPlaybackStateChanged(int playbackState) {
        switch (playbackState) {
          case Player.STATE_READY:
            // this state is returned both after prepare and after Play/Pause changes
            if (isPreparing) {
              isPreparing = false;
              eventListener.onPlayerReady(MediaPlayerEx.this);
            }
            break;
          case Player.STATE_ENDED:
            stopUpdateTask();
            cancelNotification();
            eventListener.onPlayerCompleted(MediaPlayerEx.this);
            break;
          case Player.STATE_IDLE:
          case Player.STATE_BUFFERING:
            break;
        }
      }
    });

  }

  /**
   * (Re)initialize the MediaPlayer instance on a new output device
   * @param newDevice can be "ear" or "loud"
   */
  public void setOutputDevice(OutputDeviceEnum newDevice) {

    if (newDevice == null || newDevice.equals(device)) {
      return;
    }

    // update device
    this.device = newDevice;

    // save current position and pause
    var curPos = 0L;
    var wasPlaying = isPlaying();
    if (wasPlaying) {
      stop();
      curPos = getCurrentPosition();
    }

    // re-init player
    initializePlayer();

    // restore previous status
    if (wasPlaying) {
      seekTo(curPos);
      start();
    }

  }

  // export player methods

  public void start() {
    startUpdateTask();
    createNotification();
    player.play();
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
  public void seekTo(long position) { player.seekTo(position); }
  public long getDuration() { return player.getDuration(); }
  public String getDurationHMS() { return toHMS(player.getDuration()); }
  public long getCurrentPosition() { return player.getCurrentPosition(); }
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
    eventListener.onPlayerUpdate(MediaPlayerEx.this, MediaPlayerEx.this.getCurrentPosition());
    updateNotification();
  }

  @SuppressLint("DefaultLocale")
  private String toHMS(long milliseconds) {
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

    assert notificationBuilder != null;
    notificationBuilder
      .setContentTitle(title)
      .setSmallIcon(R.drawable.ic_notification)
      .setPriority(NotificationCompat.PRIORITY_LOW) // needed to reduce "flickering" on notification updates
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
      assert notificationBuilder != null;
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

