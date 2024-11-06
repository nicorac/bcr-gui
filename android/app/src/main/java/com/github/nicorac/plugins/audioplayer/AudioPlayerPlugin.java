package com.github.nicorac.plugins.audioplayer;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.net.Uri;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AudioPlayer")
public class AudioPlayerPlugin extends Plugin implements IJSEventSender {

  private AudioPlayerService apsvc;
  private Intent svcIntent;
  private Handler mainHandler = new Handler(Looper.getMainLooper());

  /**
   * ServiceConnection used to talk with service
   */
  private final ServiceConnection serviceConnection = new ServiceConnection() {

    @Override
    public void onServiceConnected(ComponentName name, IBinder service) {
      var binder = (AudioPlayerService.AudioPlayerServiceBinder) service;
      apsvc = binder.getService(AudioPlayerPlugin.this);
    }

    @Override
    public void onServiceDisconnected(ComponentName name) {
      apsvc = null;
    }

  };

  /**
   * Plugin start
   */
  @Override
  public void load() {
    super.load();
    svcIntent = new Intent(getContext(), AudioPlayerService.class);
    // ask Android to start the service; a reference to it will be get by serviceConnection.onServiceConnected()
    var res = getContext().bindService(svcIntent, serviceConnection, Context.BIND_AUTO_CREATE);
    if (!res) {
      throw new RuntimeException("Error initializing AudioPlayerService");
    }
  }

  /**
   * Plugin destroy
   */
  @Override
  public void handleOnDestroy() {
    super.handleOnDestroy();
    getContext().stopService(svcIntent);
  }

  // plugin player methods
  @PluginMethod() public void load(PluginCall call) { mainHandler.post(() -> apsvc.load(call)); }
  @PluginMethod() public void unload(PluginCall call) { mainHandler.post(() -> apsvc.unload(call)); }
  @PluginMethod() public void play(PluginCall call) { mainHandler.post(() -> apsvc.play(call)); }
  @PluginMethod() public void pause(PluginCall call) { mainHandler.post(() -> apsvc.pause(call)); }
  @PluginMethod() public void stop(PluginCall call) { mainHandler.post(() -> apsvc.stop(call)); }
  @PluginMethod() public void getDuration(PluginCall call) { mainHandler.post(() -> apsvc.getDuration(call)); }
  @PluginMethod() public void getCurrentPosition(PluginCall call) { mainHandler.post(() -> apsvc.getCurrentPosition(call)); }
  @PluginMethod() public void setCurrentPosition(PluginCall call) { mainHandler.post(() -> apsvc.setCurrentPosition(call)); }

  // send JS events (called by service)
  public void sendJSEvent(String eventName, JSObject data) { this.notifyListeners(eventName, data); }

}
