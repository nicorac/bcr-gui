import { EventManagerPlugin } from '@angular/platform-browser';
import { PluginListenerHandle } from '@capacitor/core';

export interface AudioPlayer extends EventManagerPlugin {

  // Load the given file URI into the player
  load(data: {
    fileUri: string,
    notificationTitle?: string,
    enableEarpiece?: boolean,           // automatically switch device using proximity sensor, default = false
    keepAwakeWhenPlaying?: boolean,    // keep the screen on while playing
  }): Promise<void>;

  // free the loaded file
  unload(): Promise<void>;

  // Play controls
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;

  // Get/set current play position (in ms)
  getCurrentPosition(): Promise<{ position: number }>;
  setCurrentPosition(options: ISetCurrentPositionParams): Promise<void>;

  // Playback speed
  setPlaybackSpeed(data: { playbackSpeed: number }): Promise<void>;

  // events
  addListener(eventName: 'playerReady', listenerFunc: () => void): Promise<PluginListenerHandle> & PluginListenerHandle;
  addListener(eventName: 'playerUpdate', listenerFunc: (data: IUpdateData) => void): Promise<PluginListenerHandle> & PluginListenerHandle;
  addListener(eventName: 'playerCompleted', listenerFunc: () => void): Promise<PluginListenerHandle> & PluginListenerHandle;

  // utils

  // Get the duration of a media file (in ms)
  getAudioFileDuration(data: {
    fileUri: string,
  }): Promise<{ duration: number }>;

}

export interface ISetCurrentPositionParams {
  position?: number;  // seek position to set (in ms)
}

export interface IUpdateData {
  position: number;  // current play position (in ms)
}

