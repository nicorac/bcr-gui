import { EventManagerPlugin } from '@angular/platform-browser';
import { PluginListenerHandle } from '@capacitor/core';

export interface AudioPlayer extends EventManagerPlugin {

  // Set configuration
  setConfiguration(config: { enableEarpiece: boolean }): Promise<void>;

  // Initialize a new MediaPlayer instance on the given file URI
  init(options: { fileUri: string, notificationTitle?: string, notificationText?: string }): Promise<IBaseParams>;

  // Release MediaPlayer instance
  release(options: IBaseParams): Promise<void>;

  // Play controls
  play(options: IPlayParams): Promise<void>;
  pause(options: IBaseParams): Promise<void>;
  stop(options: IBaseParams): Promise<void>;

  // Get audio file duration (in ms)
  getDuration(options: IBaseParams): Promise<{ duration: number }>;

  // Get current play position (in ms)
  getCurrentTime(options: IBaseParams): Promise<{ currentTime: number }>;

  // events
  addListener(eventName: 'playerReady', listenerFunc: (data: IReadyData) => void): Promise<PluginListenerHandle> & PluginListenerHandle;
  addListener(eventName: 'playerUpdate', listenerFunc: (data: IUpdateData) => void): Promise<PluginListenerHandle> & PluginListenerHandle;
  addListener(eventName: 'playerCompleted', listenerFunc: (data: IBaseParams) => void): Promise<PluginListenerHandle> & PluginListenerHandle;

}

export interface IBaseParams {
  id: number; // id of the media player instance
}

export interface IPlayParams extends IBaseParams {
  position?: number;  // seek position to start play from (in ms)
}

export interface IUpdateData extends IBaseParams {
  position: number;  // current play position (in ms)
}

export interface IReadyData extends IBaseParams {
  duration: number;  // media duration (in ms)
}

export enum OutputDeviceEnum {
  Auto = 0,
  Earpiece = 1,
  Loudspeaker = 2,
}
