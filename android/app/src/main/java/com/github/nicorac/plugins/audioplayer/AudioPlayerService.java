package com.github.nicorac.plugins.audioplayer;

import android.app.Service;
import android.content.Intent;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Binder;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.annotation.Nullable;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

import java.util.HashMap;
import java.util.function.BiConsumer;

public class AudioPlayerService extends Service {

  private final static String ERR_BAD_ID = "Unexisting player with this 'id'";

  // wakelock to keep the service alive when playing
  private PowerManager.WakeLock wakeLock = null;

  // players collection
  private final HashMap<Integer, MediaPlayer> players = new HashMap<>();

  // reference to plugin
  private IJSEventSender plugin;

  // Plugin <--> Service binding support
  private final IBinder binder = new AudioPlayerServiceBinder();
  public class AudioPlayerServiceBinder extends Binder {
    public AudioPlayerService getService(IJSEventSender plugin) {
      AudioPlayerService.this.plugin = plugin;
      return AudioPlayerService.this;
    }
  };

  @Override
  public void onCreate() {
    super.onCreate();
    var powerManager = (PowerManager) getSystemService(POWER_SERVICE);
    wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AudioService::WakelockTag");
  }

  @Override
  public void onDestroy() {
    super.onDestroy();
    for (MediaPlayer player : players.values()) {
      destroyPlayer(player);
    }
    players.clear();
    wakeLockUpdate();
  }

  @Override
  public IBinder onBind(Intent intent) {
    return binder;
  }

  private void showForegroundNotification() {
    // Setup foreground notification if needed
    // ...
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

    // calculate fileUri hash
    var id = fileUriStr.hashCode();

    // initialize media player (if needed)
    if (!players.containsKey(id)) {
      try {

        var fileUri = Uri.parse(fileUriStr);
        var mediaPlayer = MediaPlayer.create(this, fileUri);
        mediaPlayer.setLooping(false);
        players.put(id, mediaPlayer);

        // Set completion listener
        mediaPlayer.setOnCompletionListener(mp -> {
          var res = new JSObject();
          res.put("id", id);
          plugin.sendJSEvent("playCompleted", res);
        });

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
   * Release current audio file and free linked mediaplayer
   */
  public void release(PluginCall call) {

    var id = getPlayerId(call);
    if (id == null) return;

    // remove item
    var mediaPlayer = players.get(id);
    if (mediaPlayer == null) {
      call.reject(ERR_BAD_ID);
      return;
    }
    else {
      destroyPlayer(mediaPlayer);
      players.remove(id);
    }

    call.resolve();

  }

  /**
   * Destroy a MediaPlayer instance
   */
  private void destroyPlayer(MediaPlayer mediaPlayer) {
    try {
      mediaPlayer.stop();
      wakeLockUpdate();
      mediaPlayer.release();
    }
    catch (Exception ignored) {}
  }

  /**
   * Play the loaded audio file
   */
  public void play(PluginCall call) {

    // get target player
    var mediaPlayer = getPlayer(call);
    if (mediaPlayer == null) return;

    // test if a position has been passed
    var position = call.getInt("position");
    if (position != null) {
      mediaPlayer.seekTo(position);
    }
    if (!mediaPlayer.isPlaying()) {
      mediaPlayer.start();
      wakeLockUpdate();
    }
    call.resolve();

  }

  /**
   * Pause currently playing audio
   */
  public void pause(PluginCall call) {

    // get target player
    var mediaPlayer = getPlayer(call);
    if (mediaPlayer == null) return;

    if (mediaPlayer.isPlaying()) {
      mediaPlayer.pause();
      wakeLockUpdate();
    }
    call.resolve();

  }

  /**
   * Stop playing audio file
   */
  public void stop(PluginCall call) {

    // get target player
    var mediaPlayer = getPlayer(call);
    if (mediaPlayer == null) return;

    if (mediaPlayer.isPlaying()) {
      mediaPlayer.stop();
      wakeLockUpdate();
    }
    call.resolve();

  }

  /**
   * Get current audio duration (in milliseconds)
   */
  public void getDuration(PluginCall call) {

    // get target player
    var mediaPlayer = getPlayer(call);
    if (mediaPlayer == null) return;

    var res = new JSObject();
    res.put("duration", mediaPlayer.getDuration());
    call.resolve(res);

  }

  /**
   * Get current play position (in milliseconds)
   */
  public void getCurrentTime(PluginCall call) {

    // get target player
    var mediaPlayer = getPlayer(call);
    if (mediaPlayer == null) return;

    var res = new JSObject();
    res.put("currentTime", mediaPlayer.getCurrentPosition());
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
  private MediaPlayer getPlayer(PluginCall call) {

    var id = getPlayerId(call);
    if (id == null) return null;

    var player = players.get(id);
    if (player == null) {
      call.reject(ERR_BAD_ID);
    }

    return player;

  }
}
