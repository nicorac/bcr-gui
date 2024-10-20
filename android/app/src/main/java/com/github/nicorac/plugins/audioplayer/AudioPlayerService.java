package com.github.nicorac.plugins.audioplayer;

import static com.github.nicorac.plugins.audioplayer.AudioDeviceEnum.DEVICE_EARPIECE;
import static com.github.nicorac.plugins.audioplayer.AudioDeviceEnum.DEVICE_LOUDSPEAKER;
import static com.github.nicorac.plugins.audioplayer.AudioDeviceEnum.DEVICE_UNDEFINED;

import android.annotation.SuppressLint;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Binder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.github.nicorac.bcrgui.MainActivity;
import com.github.nicorac.bcrgui.R;

import java.util.Objects;

public class AudioPlayerService extends MediaSessionService {

  // notifications management
  private static final int NOTIFICATION_ID = 1;
  private static final String NOTIFICATION_CHANNEL_ID = "BCR-GUI";
  private static final String NOTIFICATION_CHANNEL_NAME = "BCR-GUI - Play status";
  private PendingIntent bringAppToForegroundIntent;
  private NotificationManager notificationManager;
  private androidx.core.app.NotificationCompat.Builder notificationBuilder;
  private boolean isNotificationVisible = false;
  private String notificationTitle = "";
  public Handler playerThreadHandler;

  private PowerManager.WakeLock wakeLockPlay = null;
  private PowerManager.WakeLock wakeLockProximity = null;

  // player fields
  private ExoPlayer player = null;
  private boolean isPreparing = false;
  private boolean isLoaded = false;
  private AudioManager audioManager = null;
  @AudioDeviceEnum.AudioDeviceValue private int currentOutputDevice = DEVICE_UNDEFINED;
  private MediaSession mediaSession;

  // reference to plugin
  private AudioPlayerPlugin plugin;

  // Plugin <--> Service binding support
  private final IBinder binder = new AudioPlayerServiceBinder();
  public class AudioPlayerServiceBinder extends Binder {
    public AudioPlayerService getService(AudioPlayerPlugin plugin) {
      AudioPlayerService.this.plugin = plugin;
      return AudioPlayerService.this;
    }
  }

  // proximity sensor management
  private SensorManager sensorManager;
  private Sensor proximitySensor;
  private SensorEventListener proximityListener;

  // events and update handler (in current "CapacitorPlugins" thread)
  private static final int UPDATE_INTERVAL = 500;
  private Runnable updateRunnable;


  @Override
  public void onCreate() {

    super.onCreate();
    audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);

    // Create an Intent for the "bring-to-front" action to be linked in notifications
    var customIntent = new Intent(
      getApplicationContext(),
      MainActivity.class
    );
    customIntent.setAction(Intent.ACTION_MAIN);
    customIntent.addCategory(Intent.CATEGORY_LAUNCHER);

    // PendingIntent run when clicking on notification content
    bringAppToForegroundIntent = PendingIntent.getActivity(
      getApplicationContext(), 0, customIntent,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );

    // get instance of NotificationManager and create notifications channel
    if (notificationManager == null) {
      notificationManager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        var channel = new NotificationChannel(
          NOTIFICATION_CHANNEL_ID,
          NOTIFICATION_CHANNEL_NAME,
          NotificationManager.IMPORTANCE_DEFAULT
        );
        notificationManager.createNotificationChannel(channel);
      }
    }

    // init a new notification builder
    notificationBuilder = new androidx.core.app.NotificationCompat.Builder(getApplicationContext(), NOTIFICATION_CHANNEL_ID);
  }

  @Nullable
  @Override
  public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
    return mediaSession;
  }

  @Override
  public void onDestroy() {
    super.onDestroy();

    try {
      unload();
      player = null;
      if (mediaSession != null) mediaSession.release();
    }
    catch (Exception ignored) {}

  }

  @Override
  public void onTaskRemoved(Intent rootIntent) {
    onDestroy();
  }

  @Override
  public IBinder onBind(Intent intent) {
    super.onBind(intent);
    return binder;
  }


  // player methods

  /**
   * Initialize the player on the given audio file
   */
  public void load(PluginCall call) {

    if (isLoaded) {
      unload();
    }
    playerThreadHandler = new Handler();

    // get input arguments
    var fileUriStr = call.getString("fileUri");
    if (fileUriStr == null) {
      call.reject("Missing fileUri parameter", ErrorCodes.ERR_BAD_URI);
      return;
    }
    var fileUri = Uri.parse(fileUriStr);
    notificationTitle = call.getString("notificationTitle", "");

    // load media file
    try {

      // create MediaPlayer instance
      player = new ExoPlayer.Builder(getApplicationContext()).build();
      var mediaItem = MediaItem.fromUri(fileUri);
      setOutputDevice(DEVICE_LOUDSPEAKER);
      player.setMediaItem(mediaItem);

      // wakelocks to keep the service alive when playing and turn off screen when in proximity
      PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);

      // initialize proximity
      if (Boolean.TRUE.equals(call.getBoolean("enableEarpiece", false))) {
        wakeLockProximity = powerManager.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "BcrGuiAudioPlayerService::ProximityWakeLock");
        initProximitySensor();
      }

      if (Boolean.TRUE.equals(call.getBoolean("keepAwakeWhenPlaying", false))) {
        wakeLockPlay = powerManager.newWakeLock(PowerManager.FULL_WAKE_LOCK, "BcrGuiAudioPlayerService::WakeLock");
      }

      // initialize MediaSession
      if (mediaSession != null) {
        mediaSession.release();
      }
      mediaSession = new MediaSession.Builder(this, player)
        // .setCallback(new MediaSession.Callback() {
        //   @Override
        //   public void onPlay() { player.play(); }
        //
        //   @Override
        //   public void onPause() { player.pause(); }
        // })
        .build();

      // attach events listener
      player.addListener(new ExoPlayer.Listener() {
        @Override
        public void onPlaybackStateChanged(int playbackState) {
          switch (playbackState) {
            case ExoPlayer.STATE_READY:
              // this state is returned both after prepare and after Play/Pause changes
              if (isPreparing) {
                isPreparing = false;
                var res = new JSObject();
                res.put("duration", player.getDuration());
                plugin.sendJSEvent("playerReady", res);
                isLoaded = true;
              }
              break;
            case ExoPlayer.STATE_ENDED:
              stopUpdateTask();
              cancelNotification();
              var res = new JSObject();
              plugin.sendJSEvent("playCompleted", res);
              break;
            case ExoPlayer.STATE_IDLE:
            case ExoPlayer.STATE_BUFFERING:
              break;
          }
        }
      });

      // prepare the player
      isPreparing = true;
      player.prepare();

    } catch (Exception e) {
      call.reject("Error initializing player for audio file: " + fileUriStr + " - " + e.getMessage());
      return;
    }

    call.resolve();

  }

  /**
   * Free the player
   */
  public void unload(PluginCall call) {
    unload();
    call.resolve();
  }
  public void unload() {
    if (isLoaded) {
      stop();
      releaseProximitySensor();
      releaseWakeLockPlay();
      if (wakeLockPlay != null) wakeLockPlay = null;
      player.release();
      player = null;
      playerThreadHandler = null;
      isLoaded = false;
    }
  }

  /**
   * Play the loaded audio file
   */
  public void play(PluginCall call) {

    if (!isLoaded) {
      call.reject(ErrorCodes.ERR_NOT_LOADED);
      return;
    }

    if (!player.isPlaying()) {
      player.play();
      updateWakeLockPlay();
      createNotification();
      startUpdateTask();
    }

    call.resolve();

  }

  /**
   * Pause currently playing audio
   */
  public void pause(PluginCall call) {

    if (!isLoaded) {
      call.reject(ErrorCodes.ERR_NOT_LOADED);
      return;
    }

    player.pause();
    updateWakeLockPlay();
    stopUpdateTask();
    cancelNotification();

    call.resolve();

  }

  /**
   * Stop playing audio file
   */
  public void stop(PluginCall call) {
    if (!isLoaded) {
      call.reject(ErrorCodes.ERR_NOT_LOADED);
      return;
    }
    stop();
    call.resolve();
  }
  private void stop() {
    if (player != null && player.isPlaying()) {
      player.stop();
    }
    updateWakeLockPlay();
    stopUpdateTask();
    cancelNotification();
  }

  /**
   * Get current audio duration (in milliseconds)
   */
  public void getDuration(PluginCall call) {

    if (!isLoaded) {
      call.reject(ErrorCodes.ERR_NOT_LOADED);
      return;
    }

    var res = new JSObject();
    res.put("duration", player.getDuration());
    call.resolve(res);

  }

  /**
   * Get current play position (in milliseconds)
   */
  public void getCurrentPosition(PluginCall call) {

    if (!isLoaded) {
      call.reject(ErrorCodes.ERR_NOT_LOADED);
      return;
    }

    var res = new JSObject();
    res.put("position", player.getCurrentPosition());
    call.resolve(res);

  }

  /**
   * Set current play position (in milliseconds)
   */
  public void setCurrentPosition(PluginCall call) {

    if (!isLoaded) {
      call.reject(ErrorCodes.ERR_NOT_LOADED);
      return;
    }

    long pos = -1;
    try {
      pos = Objects.requireNonNull(call.getDouble("position", -1.0)).longValue();
    }
    catch (Exception ex) { }

    if (pos < 0) {
      call.reject("Missing or invalid 'position' parameter", ErrorCodes.ERR_BAD_ARGUMENT);
    }

    player.seekTo(pos);
    doUpdate();
    call.resolve();

  }

  // output device

  /**
   * Change output device for all players
   */
  private void setOutputDevice(@AudioDeviceEnum.AudioDeviceValue int newDevice) {

    // set new output device
    currentOutputDevice = newDevice;

    if (currentOutputDevice == DEVICE_EARPIECE) {
      var audioAttributes = new androidx.media3.common.AudioAttributes.Builder()
        .setUsage(C.USAGE_VOICE_COMMUNICATION)
        .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
        .build();
      player.setAudioAttributes(audioAttributes, false);
      audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
      audioManager.setSpeakerphoneOn(false);
    }
    else {
      var audioAttributes = new androidx.media3.common.AudioAttributes.Builder()
        .setUsage(C.USAGE_MEDIA)
        .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
        .build();
      player.setAudioAttributes(audioAttributes, true);
      audioManager.setMode(AudioManager.MODE_NORMAL);
      audioManager.setSpeakerphoneOn(true);
    }

    // turn screen off when earpiece active
    if (wakeLockProximity != null) {
      if (currentOutputDevice == DEVICE_EARPIECE) {
        if (player.isPlaying() && !wakeLockProximity.isHeld()) {
          wakeLockProximity.acquire(4 * 60 * 60 * 1000L); /* 4 hours */
        }
      } else {
        if (wakeLockProximity.isHeld()) {
          wakeLockProximity.release();
        }
      }
    }

  }

  // proximity sensor management

  /**
   * Initialize proximity sensor management
   */
  private void initProximitySensor() {

    if (sensorManager != null) {
      releaseProximitySensor();
    }

    sensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
    proximitySensor = sensorManager.getDefaultSensor(Sensor.TYPE_PROXIMITY);

    // listen to sensor events and call setOutputDevice() on changes
    proximityListener = new SensorEventListener() {

      final float sensorMaxRange = proximitySensor.getMaximumRange();

      @Override
      public void onSensorChanged(SensorEvent event) {
        var newDevice = event.values[0] < sensorMaxRange
          ? DEVICE_EARPIECE
          : DEVICE_LOUDSPEAKER;
        // sensor will continuously stream its value, so we'll need to avoid useless changes
        if (newDevice != currentOutputDevice) {
          setOutputDevice(newDevice);
        }
      }

      @Override
      public void onAccuracyChanged(Sensor sensor, int accuracy) {
        // Handle accuracy changes if needed
      }

    };

    // Register the proximity sensor listener (in current "CapacitorPlugins" thread)
    sensorManager.registerListener(
      proximityListener,
      proximitySensor,
      SensorManager.SENSOR_DELAY_NORMAL,
      playerThreadHandler
    );

  }

  /**
   * Cleanup proximity sensor management
   */
  private void releaseProximitySensor() {
    if (sensorManager != null && proximityListener != null) {
      sensorManager.unregisterListener(proximityListener);
      sensorManager = null;
      proximityListener = null;
    }
    if (wakeLockProximity != null) {
      if (wakeLockProximity.isHeld()) {
        wakeLockProximity.release();
      }
      wakeLockProximity = null;
    }
  }

  // wakelock management

  /**
   * Update the status of wakeLockPlay, enabled if the player is playing
   */
  private void updateWakeLockPlay() {

    if (wakeLockPlay != null) {
      if (isLoaded && player.isPlaying() && !wakeLockPlay.isHeld()) {
        wakeLockPlay.acquire(4 * 60 * 60 * 1000L /* 4 hours */);
      } else if (wakeLockPlay.isHeld()) {
        wakeLockPlay.release();
      }
    }

  }

  /**
   * Release wakeLockPlay
   */
  private void releaseWakeLockPlay() {

    if (wakeLockPlay != null) {
      if (wakeLockPlay.isHeld()) {
        wakeLockPlay.release();
      }
      wakeLockPlay = null;
    }

  }

  // update management

  /**
   * Start an update task (each UPDATE_INTERVAL ms) to update notification text
   */
  private void startUpdateTask() {
    if (updateRunnable == null) {
      updateRunnable = new Runnable() {
        @Override
        public void run() {
          doUpdate();
          // Post the same runnable again after UPDATE_INTERVAL ms
          playerThreadHandler.postDelayed(this, UPDATE_INTERVAL);
        }
      };
      // first trigger
      doUpdate();
      playerThreadHandler.postDelayed(updateRunnable, UPDATE_INTERVAL);
    }
  }

  /**
   * Stop the existing update task
   */
  private void stopUpdateTask() {
    if (updateRunnable != null) {
      playerThreadHandler.removeCallbacks(updateRunnable);
      updateRunnable = null;
    }
  }

  /**
   * Raise the JS update event and update notification
   */
  private void doUpdate() {
    if (player != null) {
      var res = new JSObject();
      res.put("position", player.getCurrentPosition());
      plugin.sendJSEvent("playerUpdate", res);
      updateNotification();
    }
  }

  // notification management

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
      .setContentTitle(notificationTitle)
      .setSmallIcon(R.drawable.ic_notification)
      .setPriority(NotificationCompat.PRIORITY_LOW) // needed to reduce "flickering" on notification updates
      .setContentIntent(bringAppToForegroundIntent)
      .setVibrate(new long[]{0L})
      // Set as "persistent"
      //.setOngoing(true)
    ;

    isNotificationVisible = true;
    updateNotification();
  }

  /**
   * Update existing notification
   */
  private void updateNotification() {
    if (isNotificationVisible) {
      assert notificationBuilder != null;
      notificationBuilder.setContentText(toHMS(player.getCurrentPosition()) + " / " + toHMS(player.getDuration()));
      // set/update the notification
      notificationManager.notify(NOTIFICATION_ID, notificationBuilder.build());
    }
  }

  /**
   * Cancel existing notification
   */
  public void cancelNotification() {
    if (isNotificationVisible) {
      notificationManager.cancel(NOTIFICATION_ID);
      isNotificationVisible = false;
    }
  }

}

