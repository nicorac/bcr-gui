package com.github.nicorac.plugins.audioplayer;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.net.Uri;
import android.os.Binder;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.annotation.Nullable;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.github.nicorac.bcrgui.MainActivity;

import java.util.HashMap;

public class AudioPlayerService extends Service {

  private static final String ERR_BAD_ID = "Can't find a player instance with this 'id'";

  private static final String NOTIFICATION_CHANNEL_ID = "BCR-GUI";
  private static final String NOTIFICATION_CHANNEL_NAME = "BCR-GUI - Play status";
  private static PendingIntent bringAppToForegroundIntent;
  private static NotificationManager notificationManager;

  // wakelocks to keep the service alive when playing and turn off screen when in proximity
  private PowerManager.WakeLock wakeLockPlay = null;
  private PowerManager.WakeLock wakeLockProximity = null;

  // players collection
  private final HashMap<Integer, MediaPlayerEx> players = new HashMap<>();

  // reference to plugin
  private IJSEventSender plugin;

  // proximity sensor management
  private SensorManager sensorManager;
  private Sensor proximitySensor;
  private SensorEventListener proximityListener;
  private OutputDeviceEnum currentOutputDevice = null;

  // Plugin <--> Service binding support
  private final IBinder binder = new AudioPlayerServiceBinder();
  public class AudioPlayerServiceBinder extends Binder {
    public AudioPlayerService getService(IJSEventSender plugin) {
      AudioPlayerService.this.plugin = plugin;
      return AudioPlayerService.this;
    }
  }

  @Override
  public void onCreate() {

    super.onCreate();
    var powerManager = (PowerManager) getSystemService(POWER_SERVICE);
    wakeLockPlay = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "BcrGuiAudioPlayerService::WakeLock");
    wakeLockProximity = powerManager.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "BcrGuiAudioPlayerService::ProximityWakeLock");

    // Create an Intent for the "bring-to-front" action to be linked in notifications
    var customIntent = new Intent(getApplicationContext(), MainActivity.class);
    customIntent.setAction(Intent.ACTION_MAIN);
    customIntent.addCategory(Intent.CATEGORY_LAUNCHER);

    // get instance of NotificationManager and create notifications channel
    if (notificationManager == null) {
      notificationManager = (NotificationManager) getApplicationContext().getSystemService(NOTIFICATION_SERVICE);
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        var channel = new NotificationChannel(
          NOTIFICATION_CHANNEL_ID,
          NOTIFICATION_CHANNEL_NAME,
          NotificationManager.IMPORTANCE_DEFAULT
        );
        notificationManager.createNotificationChannel(channel);
      }
    }

    // Create a PendingIntent
    bringAppToForegroundIntent = PendingIntent.getActivity(
      getApplicationContext(), 0, customIntent,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );

  }

  @Override
  public void onDestroy() {
    super.onDestroy();
    for (MediaPlayerEx i : players.values()) {
      release(i);
    }
    players.clear();
    cleanupProximitySensor();
    if (wakeLockPlay.isHeld()) wakeLockPlay.release();
    if (wakeLockProximity.isHeld()) wakeLockProximity.release();

  }

  @Override
  public void onTaskRemoved(Intent rootIntent) {
    // cancel all notifications
  }

  @Override
  public IBinder onBind(Intent intent) {
    return binder;
  }

  /**
   * Initialize a new player on the given audio file (or return the already existing one)
   */
  public void init(PluginCall call) {

    // get input arguments
    var fileUriStr = call.getString("fileUri");
    if (fileUriStr == null) {
      call.reject("Missing fileUri parameter");
      return;
    }
    var notificationTitle = call.getString("notificationTitle", "");
    var notificationText = call.getString("notificationText", "");

    // calculate fileUri hash
    var id = fileUriStr.hashCode();

    // initialize media player (if needed)
    if (!players.containsKey(id)) {
      try {
        var fileUri = Uri.parse(fileUriStr);
        var mpe = createPlayerInstance(id, fileUri, notificationTitle, notificationText);
        players.put(id, mpe);
      } catch (Exception e) {
        call.reject("Error loading audio file: " + fileUriStr);
        return;
      }
    }

    // return id of the new/existing MediaPlayer instance
    var res = new JSObject();
    res.put("id", id);
    call.resolve(res);

  }

  /**
   * Set player configuration
   */
  public void setConfiguration(PluginCall call) {

    var enableEarpiece = call.getBoolean("enableEarpiece", false);

    // initialize proximity sensor when earpiece is enabled
    if (enableEarpiece != null && enableEarpiece) {
      initProximitySensor();
    }
    else {
      cleanupProximitySensor();
    }

    call.resolve();

  }

  /**
   * Create a new instance of MediaPlayer class
   */
  private MediaPlayerEx createPlayerInstance(int id, Uri fileUri, String notificationTitle, String notificationText) {

    return new MediaPlayerEx(
      getApplicationContext(),
      fileUri,
      notificationTitle,
      notificationText,
      new OnEventListener() {

        @Override
        public PendingIntent getNotificationClickIntent() { return bringAppToForegroundIntent; }

        @Override
        public void onPlayerReady(MediaPlayerEx player) {
          var res = new JSObject();
          res.put("id", id);
          res.put("duration", player.getDuration());
          plugin.sendJSEvent("playerReady", res);
        }

        @Override
        public void onPlayerUpdate(MediaPlayerEx player) {
          var res = new JSObject();
          res.put("id", id);
          res.put("position", player.getCurrentPosition());
          plugin.sendJSEvent("playerUpdate", res);
        }

        @Override
        public void onPlayerCompleted(MediaPlayerEx mp) {
          var res = new JSObject();
          res.put("id", id);
          plugin.sendJSEvent("playCompleted", res);
        }

      },
      currentOutputDevice
    );

  }

  /**
   * Release current audio file and free the linked MediaPlayer
   */
  public void release(PluginCall call) {

    var id = getPlayerId(call);
    if (id == null) {
      call.reject(ERR_BAD_ID);
      return;
    }

    // remove item
    var p = players.get(id);
    if (p == null) {
      call.reject(ERR_BAD_ID);
      return;
    }
    else {
      release(p);
    }

    call.resolve();

  }

  /**
   * Destroy a MediaPlayer instance
   */
  private void release(MediaPlayerEx p) {
    try {
      stop(p);
      p.release();
      players.remove(p.id);
    }
    catch (Exception ignored) {}
  }

  /**
   * Play the loaded audio file
   */
  public void play(PluginCall call) {

    // get target player
    var p = getPlayerInstance(call);
    if (p == null) return;

    // test if a position has been passed
    var position = call.getInt("position");
    if (position != null) {
      p.seekTo(position);
    }
    if (!p.isPlaying()) {
      p.start();
      wakeLockUpdate();
    }
    call.resolve();

  }

  /**
   * Pause currently playing audio
   */
  public void pause(PluginCall call) {

    // get target player
    var i = getPlayerInstance(call);
    if (i == null) return;

    if (i.isPlaying()) {
      i.pause();
      wakeLockUpdate();
    }
    call.resolve();

  }

  /**
   * Stop playing audio file
   */
  public void stop(PluginCall call) {
    // get target player
    var i = getPlayerInstance(call);
    if (i == null) return;
    stop(i);
    call.resolve();
  }
  public void stop(MediaPlayerEx p) {

    if (p.isPlaying()) {
      p.stop();
      wakeLockUpdate();
    }

  }

  /**
   * Get current audio duration (in milliseconds)
   */
  public void getDuration(PluginCall call) {

    // get target player
    var i = getPlayerInstance(call);
    if (i == null) return;

    var res = new JSObject();
    res.put("duration", i.getDuration());
    call.resolve(res);

  }

  /**
   * Get current play position (in milliseconds)
   */
  public void getCurrentTime(PluginCall call) {

    // get target player
    var i = getPlayerInstance(call);
    if (i == null) return;

    var res = new JSObject();
    res.put("currentTime", i.getCurrentPosition());
    call.resolve(res);

  }

  /**
   * Update the status of wakelock:
   * enabled if at least one of the media player instances is playing
   */
  private void wakeLockUpdate() {

    // shall we enable or disable wakelock?
    var toBeEnabled = false;
    try {
      for (var i : players.values()) {
        if (i.isPlaying()) {
          toBeEnabled = true;
          break;
        }
      }
    }
    catch (Exception ignored) {}

    if (toBeEnabled && !wakeLockPlay.isHeld()) {
      wakeLockPlay.acquire(4 * 60 * 60 * 1000L /* 4 hours */);
    }
    else if (!toBeEnabled && wakeLockPlay.isHeld()) {
      wakeLockPlay.release();
    }

  }

  @Nullable
  private Integer getPlayerId(PluginCall call) {
    var id = call.getInt("id");
    if (id == null) {
      call.reject("Missing 'id' parameter");
    }
    return id;
  }

  /**
   * Return the existing media player instance from id
   */
  @Nullable
  private MediaPlayerEx getPlayerInstance(PluginCall call) {

    var id = getPlayerId(call);
    if (id == null) return null;

    var i = players.get(id);
    if (i == null) {
      call.reject(ERR_BAD_ID);
    }

    return i;

  }

  /**
   * Change output device for all players
   * @param newDevice Can be "ear" or "loud"
   */
  protected void changeOutputDevice(OutputDeviceEnum newDevice) {

    currentOutputDevice = newDevice;

    // change device (will reinitialize the players)
    // and test if any player is playing?
    var isPlaying = false;
    for (MediaPlayerEx p : players.values()) {
      isPlaying |= p.isPlaying();
      p.setOutputDevice(newDevice);
    }

    // turn screen off when earpiece active
    if (currentOutputDevice == OutputDeviceEnum.Earpiece) {
      if (isPlaying && !wakeLockProximity.isHeld()) {
        wakeLockProximity.acquire(4 * 60 * 60 * 1000L); /* 4 hours */
      }
    }
    else {
      if (wakeLockProximity.isHeld()) {
        wakeLockProximity.release();
      }
    }

  }

  /**
   * Initialize proximity sensor management
   */
  private void initProximitySensor() {

    if (sensorManager != null) {
      cleanupProximitySensor();
    }

    // audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
    sensorManager = (SensorManager) getSystemService(SENSOR_SERVICE);
    proximitySensor = sensorManager.getDefaultSensor(Sensor.TYPE_PROXIMITY);

    // listen to sensor events and call setOutputDevice() on changes
    proximityListener = new SensorEventListener() {

      @Override
      public void onSensorChanged(SensorEvent event) {
        var newDevice = event.values[0] < proximitySensor.getMaximumRange()
          ? OutputDeviceEnum.Earpiece
          : OutputDeviceEnum.Loudspeaker;
        if (!newDevice.equals(currentOutputDevice)) {
          changeOutputDevice(newDevice);
        }
      }

      @Override
      public void onAccuracyChanged(Sensor sensor, int accuracy) {
        // Handle accuracy changes if needed
      }

    };

    // Register the proximity sensor listener
    sensorManager.registerListener(proximityListener, proximitySensor, SensorManager.SENSOR_DELAY_NORMAL);

  }

  /**
   * Cleanup proximity sensor management
   */
  private void cleanupProximitySensor() {
    if (sensorManager != null && proximityListener != null) {
      sensorManager.unregisterListener(proximityListener);
      sensorManager = null;
      proximityListener = null;
    }
  }

}

