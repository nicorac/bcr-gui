package com.github.nicorac.plugins.audioplayer;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
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

  // wakelock to keep the service alive when playing
  private PowerManager.WakeLock wakeLock = null;

  // players collection
  private final HashMap<Integer, MediaPlayerEx> players = new HashMap<>();

  // reference to plugin
  private IJSEventSender plugin;

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
    wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AudioPlayerService::WakelockTag");

    // Create an Intent for the "bring-to-front" action to be linked in notifications
    Intent customIntent = new Intent(getApplicationContext(), MainActivity.class);
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
    wakeLockUpdate();
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
        var mpe = new MediaPlayerEx(
          getApplicationContext(),
          fileUri,
          notificationTitle,
          notificationText,
          new OnEventListener() {

            @Override
            public PendingIntent getNotificationClickIntent() { return bringAppToForegroundIntent; }

            @Override
            public void onUpdate(MediaPlayerEx player) {
              var res = new JSObject();
              res.put("id", id);
              res.put("position", player.getCurrentPosition());
              plugin.sendJSEvent("update", res);
            }

            @Override
            public void onCompletion(MediaPlayerEx mp) {
              var res = new JSObject();
              res.put("id", id);
              plugin.sendJSEvent("playCompleted", res);
            }

          }
        );
        players.put(id, mpe);

      } catch (Exception e) {
        call.reject("Error loading audio file: " + fileUriStr);
        return;
      }
    }

    // return id of the new/existing mediaplayer instance
    var res = new JSObject();
    res.put("id", id);
    call.resolve(res);

  }

  /**
   * Release current audio file and free the linked mediaplayer
   */
  public void release(PluginCall call) {

    var id = getPlayerId(call);
    if (id == null) {
      call.reject(ERR_BAD_ID);
      return;
    };

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

    if (toBeEnabled && !wakeLock.isHeld()) {
      wakeLock.acquire(4 * 60 * 60 * 1000L /* 4 hours */);
    }
    else if (!toBeEnabled && wakeLock.isHeld()) {
      wakeLock.release();
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

}
