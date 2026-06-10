package com.github.nicorac.plugins.audioplayer;

import static com.github.nicorac.plugins.audioplayer.AudioDeviceEnum.DEVICE_EARPIECE;
import static com.github.nicorac.plugins.audioplayer.AudioDeviceEnum.DEVICE_LOUDSPEAKER;
import static com.github.nicorac.plugins.audioplayer.AudioDeviceEnum.DEVICE_UNDEFINED;

import android.annotation.SuppressLint;
import android.app.Notification;
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
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Binder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import androidx.annotation.Nullable;
import androidx.annotation.OptIn;
import androidx.core.app.NotificationCompat;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.exoplayer.source.ProgressiveMediaSource;
import androidx.media3.extractor.DefaultExtractorsFactory;
import androidx.media3.extractor.amr.AmrExtractor;
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
  private String notificationTitle = "";
  private boolean isNotificationVisible = false;

  private PowerManager.WakeLock wakeLockPlay = null;
  private PowerManager.WakeLock wakeLockProximity = null;

  // player fields
  private ExoPlayer player = null;
  private boolean isPreparing = false;
  private boolean isLoaded = false;
  private AudioManager audioManager = null;
  @AudioDeviceEnum.AudioDeviceValue
  private int currentOutputDevice = DEVICE_UNDEFINED;
  private float playbackSpeed = 1.0f;
  private MediaSession mediaSession;
  private Handler updateHandler;

  // wakelocks to keep the service alive when playing and turn off screen when in proximity
  private PowerManager powerManager;

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
  private SensorEventListener proximityListener;

  // events and update handler (in current "CapacitorPlugins" thread)
  private static final int UPDATE_INTERVAL = 500;
  private Runnable updateRunnable;


  @Override
  public void onCreate() {

    super.onCreate();
    audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
    powerManager = (PowerManager) getSystemService(POWER_SERVICE);

    // create an Intent for the "bring-to-front" action to be linked in notifications
    var customIntent = new Intent(getApplicationContext(), MainActivity.class);
    customIntent.setAction(Intent.ACTION_MAIN);
    customIntent.addCategory(Intent.CATEGORY_LAUNCHER);

    // PendingIntent run when clicking on notification content
    bringAppToForegroundIntent = PendingIntent.getActivity(
      getApplicationContext(), 0, customIntent,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );

    // init notifications channel
    notificationManager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationChannel channel = new NotificationChannel(
        NOTIFICATION_CHANNEL_ID,
        NOTIFICATION_CHANNEL_NAME,
        NotificationManager.IMPORTANCE_LOW
      );
      notificationManager.createNotificationChannel(channel);
    }

    // notifications builder
    notificationBuilder = new NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID);

  }

  @Nullable
  @Override
  public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
    return mediaSession;
  }

  @Override
  public void onDestroy() {
    super.onDestroy();
    // execute cleanup
    unload();
    stopSelf();
  }

  @Override
  public void onTaskRemoved(Intent rootIntent) {
    super.onTaskRemoved(rootIntent);
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
  @OptIn(markerClass = UnstableApi.class)
  public void load(PluginCall call) {

    if (isLoaded) {
      unload();
    }

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
      // this is required to let player setPosition() work
      // with .amr files without a "seek-table"
      var extractorsFactory = new DefaultExtractorsFactory()
        .setAmrExtractorFlags(AmrExtractor.FLAG_ENABLE_CONSTANT_BITRATE_SEEKING);
      var mediaSourceFactory = new ProgressiveMediaSource.Factory(
        new DefaultDataSource.Factory(getApplicationContext()),
        extractorsFactory
      );

      // create MediaPlayer instance
      player = new ExoPlayer.Builder(getApplicationContext())
        .setMediaSourceFactory(mediaSourceFactory)
        .build();
      var mediaItem = MediaItem.fromUri(fileUri);
      setOutputDevice(DEVICE_LOUDSPEAKER);
      player.setMediaItem(mediaItem);

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
                plugin.sendJSEvent("playerReady", res);
                isLoaded = true;
                // reset playback speed
                setPlaybackSpeed();
              }
              break;
            case ExoPlayer.STATE_ENDED:
              pause();            // avoid player restarting after the seekTo() call below
              player.seekTo(0);   // reset position to start
              // inform JS that play has completed
              var res = new JSObject();
              plugin.sendJSEvent("playerCompleted", res);
              break;
            case ExoPlayer.STATE_IDLE:
            case ExoPlayer.STATE_BUFFERING:
              break;
          }
        }

        @Override
        public void onIsPlayingChanged(boolean isPlaying) {
          if (isPlaying) {
            // acquire wakelock (if enabled)
            if (wakeLockPlay != null && !wakeLockPlay.isHeld()) {
              wakeLockPlay.acquire(4 * 60 * 60 * 1000L /* 4 hours */);
            }
            // set service as foreground
            startForeground(NOTIFICATION_ID, createNotification());
            startUpdateTask();
          } else {
            // release wakelock (if enabled)
            if (wakeLockPlay != null && wakeLockPlay.isHeld()) {
              wakeLockPlay.release();
            }
            stopUpdateTask();
            // remove service from foreground
            stopForeground(STOP_FOREGROUND_DETACH);
            // delete notification (call above with "true" doesn't always work)
            cancelNotification();
          }
        }
      });

      // initialize proximity (if required)
      if (Boolean.TRUE.equals(call.getBoolean("enableEarpiece", false))) {
        wakeLockProximity = powerManager.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "BcrGuiAudioPlayerService::ProximityWakeLock");
        initProximitySensor();
      }

      // initialize wakelock (if required)
      if (Boolean.TRUE.equals(call.getBoolean("keepAwakeWhenPlaying", false))) {
        wakeLockPlay = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "BcrGuiAudioPlayerService::WakeLock");
      }

      // initialize MediaSession
      if (mediaSession != null) {
        mediaSession.release();
      }
      mediaSession = new MediaSession.Builder(this, player).build();

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
      player.release();
      mediaSession.release();
      releaseProximitySensor();
      player = null;
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
    pause();
    call.resolve();
  }

  private void pause() {
    player.pause();
    stopUpdateTask();
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
    } catch (Exception ex) {
    }

    if (pos < 0) {
      call.reject("Missing or invalid 'position' parameter", ErrorCodes.ERR_BAD_ARGUMENT);
    }

    player.seekTo(pos);
    doUpdate();
    call.resolve();

  }

  /**
   * Set playback speed (0.5 => 50%, 1.0 => 100%, 1.5 => 150%...)
   */
  public void setPlaybackSpeed(PluginCall call) {
    try {
      float playbackSpeed = Objects.requireNonNull(call.getFloat("playbackSpeed", 1.0f));
      setPlaybackSpeed(playbackSpeed);
    } catch (Exception ex) {
      call.reject(ErrorCodes.ERR_BAD_ARGUMENT);
      return;
    }
    call.resolve();
  }

  private void setPlaybackSpeed() {
    setPlaybackSpeed(this.playbackSpeed);
  }
  private void setPlaybackSpeed(float playbackSpeed) {
    // store value
    this.playbackSpeed = playbackSpeed;
    // change speed on the running player, if any
    if (player != null && isLoaded) {
      try {
        player.setPlaybackSpeed(playbackSpeed);
      }
      catch (Exception ex) {
      }
    }
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
    } else {
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
    Sensor proximitySensor = sensorManager.getDefaultSensor(Sensor.TYPE_PROXIMITY);

    if (proximitySensor != null) {

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
        SensorManager.SENSOR_DELAY_NORMAL
      );
    }

  }

  /**
   * Cleanup proximity sensor management
   */
  private void releaseProximitySensor() {
    if (sensorManager != null && proximityListener != null) {
      sensorManager.unregisterListener(proximityListener);
    }
    if (wakeLockProximity != null && wakeLockProximity.isHeld()) {
      wakeLockProximity.release();
    }
    sensorManager = null;
    proximityListener = null;
    wakeLockProximity = null;
  }

  // update management

  /**
   * Start an update task (each UPDATE_INTERVAL ms) to update notification text
   */
  private void startUpdateTask() {
    updateHandler = new Handler(Objects.requireNonNullElse(Looper.myLooper(), Looper.getMainLooper()));
    updateRunnable = new Runnable() {
      @Override
      public void run() {
        doUpdate();
        // Post the same runnable again after UPDATE_INTERVAL ms
        updateHandler.postDelayed(this, UPDATE_INTERVAL);
      }
    };
    // first trigger
    updateHandler.post(updateRunnable);
  }

  /**
   * Stop the existing update task
   */
  private void stopUpdateTask() {
    if (updateHandler != null) {
      updateHandler.removeCallbacks(updateRunnable);
      updateHandler = null;
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
    var totalSeconds = Math.round(milliseconds / 1000.0);
    long hours   = totalSeconds / 3600;
    long minutes = (totalSeconds / 60) % 60;
    long seconds = totalSeconds % 60;
    if (hours > 0) {
      return String.format("%02d:%02d:%02d", hours, minutes, seconds);
    } else {
      return String.format("%02d:%02d", minutes, seconds);
    }
  }

  /**
   * Create notification
   */
  private Notification createNotification() {
    var builder = notificationBuilder
      .setContentTitle(notificationTitle)
      .setContentText("")
      .setSmallIcon(R.drawable.ic_notification)
      .setContentIntent(bringAppToForegroundIntent)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setProgress(0, 0, false)
      .setVibrate(new long[]{0L})
      .setOngoing(true)
      .build();
    isNotificationVisible = true;
    return builder;
  }

  /**
   * Update service notification
   */
  private void updateNotification() {
    notificationBuilder.setContentText(toHMS(player.getCurrentPosition()) + " / " + toHMS(player.getDuration()));
    if (isNotificationVisible) {
      notificationManager.notify(NOTIFICATION_ID, notificationBuilder.build());
    }
  }

  /**
   * Clear service notification (stopForeground(true) not working...)
   */
  private void cancelNotification() {
    if (isNotificationVisible) {
      notificationManager.cancel(NOTIFICATION_ID);
    }
  }

  /**
   * Parse the given file Uri and extract media duration (in ms)
   */
  public void getAudioFileDuration(PluginCall call) {

    // get input arguments
    var fileUriStr = call.getString("fileUri");
    if (fileUriStr == null) {
      call.reject("Missing fileUri parameter", ErrorCodes.ERR_BAD_URI);
      return;
    }
    var fileUri = Uri.parse(fileUriStr);

    var duration = 0L;
    try (var retriever = new MediaMetadataRetriever()) {
      retriever.setDataSource(getApplicationContext(), fileUri);
      String durationStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
      if (durationStr != null) {
        duration = Long.parseLong(durationStr);
      }
    }
    catch (Exception ignored) { }

    // return result
    var res = new JSObject();
    res.put("duration", duration);
    call.resolve(res);

  }

}
