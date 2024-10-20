package com.github.nicorac.plugins.audioplayer;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.IBinder;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AudioPlayer")
public class AudioPlayerPlugin extends Plugin implements IJSEventSender {

  private AudioPlayerService apsvc;

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
    public void onServiceDisconnected(ComponentName name) { }

  };

  /**
   * Start an instance of AudioService and bind to it
   */
  @Override
  public void load() {
    var context = getContext();
    var intent = new Intent(context, AudioPlayerService.class);
    // ask Android to start the service; a reference to it will be get by serviceConnection.onServiceConnected()
    var res = context.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE);
    if (!res) {
      throw new RuntimeException("AudioPlayerPlugin failed to initialize successfully: error initializing AudioService");
    }
  }

  /**
   * Cleanup everything
   */
  @Override
  public void handleOnDestroy() {
    // unbind the service
    getContext().unbindService(serviceConnection);
  }

  // reflect plugin methods to service
  @PluginMethod() public void setConfiguration(PluginCall call)
  { apsvc.setConfiguration(call); }
  @PluginMethod() public void init(PluginCall call)
  { apsvc.init(call); }
  @PluginMethod() public void release(PluginCall call)
  { apsvc.release(call); }
  @PluginMethod() public void play(PluginCall call)
  { apsvc.play(call); }
  @PluginMethod() public void pause(PluginCall call)
  { apsvc.pause(call); }
  @PluginMethod() public void stop(PluginCall call)
  { apsvc.stop(call); }
  @PluginMethod() public void getDuration(PluginCall call)
  { apsvc.getDuration(call); }
  @PluginMethod() public void getCurrentTime(PluginCall call)
  { apsvc.getCurrentTime(call); }

  // send events
  public void sendJSEvent(String eventName, JSObject data) { this.notifyListeners(eventName, data); }

}
