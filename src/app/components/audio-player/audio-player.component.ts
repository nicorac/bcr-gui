import { Subscription } from 'rxjs';
import { Recording } from 'src/app/models/recording';
import { SettingsService } from 'src/app/services/settings.service';
import { ChangeDetectorRef, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { NativeAudio } from '@capacitor-community/native-audio';
import { AlertController, Platform, RangeCustomEvent } from '@ionic/angular';

export enum PlayerStatusEnum {
  Paused = 0,
  Playing = 10,
}

@Component({
  selector: 'app-audio-player',
  templateUrl: './audio-player.component.html',
  styleUrls: ['./audio-player.component.scss'],
})
export class AudioPlayerComponent implements OnInit, OnDestroy {

  PlayerStatusEnum = PlayerStatusEnum;

  // player status
  protected ready = false;
  protected status = PlayerStatusEnum.Paused;
  protected progress = 0;   // current play position (in integer seconds)
  protected duration = 0;   // audio duration in seconds
  protected isMovingKnob = false;

  // subscriptions
  private _androidEventsSubs = new Subscription();
  private removeListener?: () => Promise<void>;

  // play update interval
  private updateInterval?: ReturnType<typeof setInterval>;

  // inputs
  @Input({ required: true }) recording!: Recording;

  // props
  get assetId() { return this.recording.audioUri; }


  constructor(
    private alertController: AlertController,
    private cdr: ChangeDetectorRef,
    private platform: Platform,
    private settings: SettingsService,
  ) { }

  async ngOnInit() {

    try {
      // when Android put app on the background we MUST unload audio
      // to avoid it automatically back to play once app restored (pause/stop doesn't work!)
      this._androidEventsSubs.add(this.platform.pause.subscribe(async () => {
        await this.unload();
      }));
      this._androidEventsSubs.add(this.platform.resume.subscribe(async () => {
        this.preloadAudio();
      }));

      // preload audio file
      await this.preloadAudio();

    } catch (error: any) {
      this.showError(error.message);
    }

  }

  async ngOnDestroy() {
    // release asset
    await this.unload();
    this._androidEventsSubs.unsubscribe();
  }

  /**
   * Preload audio file
   */
  private async preloadAudio() {

    try {
      await NativeAudio.preload({
        assetId: this.assetId,
        assetPath: this.recording.audioUri,
        isUrl: false,
      });
    } catch (error: any) {
      // the error "Audio Asset already exists" is thrown at page reload (in development) and can be ignored
      if (error.message !== 'Audio Asset already exists') {
        throw error;
      }
    }

    // subscribe to playComplete event
    await NativeAudio.addListener(
      'complete',
      async (res) => {
        if (res.assetId === this.assetId) {
          NativeAudio.stop({ assetId: this.assetId });
          await this.stopUpdateInterval();
          this.status = PlayerStatusEnum.Paused;
          this.progress = 0;
          this.cdr.detectChanges(); // workaround needed to let Angular update values...
        }
      }
    ).then(res => {
      // save reference to listener remove function
      this.removeListener = res.remove;
    });

    // get audio duration
    const res = await NativeAudio.getDuration({ assetId: this.assetId });
    this.duration = Math.ceil(res.duration);
    this.ready = true;

    // set duration to recording item
    // (if not already set with JSON metadata file)
    if (!this.recording.duration) {
      this.recording.duration = this.duration;
    }

    // workaround needed to let Angular update values...
    this.cdr.detectChanges();

  }

  /**
   * Release loaded audio file
   */
  private async unload() {

    await this.stopUpdateInterval();
    this.status = PlayerStatusEnum.Paused;
    this.ready = false;

    await NativeAudio.unload({ assetId: this.assetId });
    await this.removeListener?.();
    this.cdr.detectChanges(); // workaround needed to let Angular update values...
  }

  /**
   * Start a JS interval to update player status
   */
  private async startUpdateInterval() {

    await this.stopUpdateInterval();

    // start update interval
    this.updateInterval = setInterval(() => {
      NativeAudio.getCurrentTime({ assetId: this.assetId }).then(res => {
        if (!this.isMovingKnob) {
          this.progress = Math.ceil(res.currentTime);
        }
      });
    }, 500);

    // keep screen on
    await KeepAwake.keepAwake();

  }

  /**
   * Clear update interval
   */
  private async stopUpdateInterval() {

    if (this.updateInterval) {

      clearInterval(this.updateInterval);

      // allow screen off
      await KeepAwake.allowSleep();

    }

  }

  /**
   * Show error alert
   */
  private async showError(error: string) {
    const alert = await this.alertController.create({
      header: 'Play error',
      message: error,
      buttons: [ 'Close' ],
    });
    await alert.present();
  }

  /**
   * Toggle between play and pause
   */
  protected async toggle() {
    if (this.status === PlayerStatusEnum.Paused) {
      return this.play();
    }
    else {
      return this.pause();
    }
  }

  /**
   * Play the given record file (already loaded with load())
   */
  protected async play(position?: number) {

    if (position === undefined) {
      position = this.progress;
    }

    // start/resume play
    NativeAudio.play({ assetId: this.assetId, time: position })
      .then(async _ => {
        this.status = PlayerStatusEnum.Playing;
        await this.startUpdateInterval();
      })
      .catch(error => this.showError(error.message));
  }

  /**
   * Fast forward / rewind
   */
  protected async seek(delta: number) {
    this.play(this.progress + delta * this.settings.seekTime);
  }

  /**
   * Pause the playing media file
   */
  async pause() {

    if (this.status !== PlayerStatusEnum.Playing) {
      return;
    }
    await this.stopUpdateInterval();

    // pause audio
    await NativeAudio.pause({ assetId: this.assetId })
      .then(_ => this.status = PlayerStatusEnum.Paused)
      .catch(error => this.showError(error.message));
  }

  /**
   * User started dragging the position knob
   */
  protected onIonKnobMoveStart(_ev: Event) {
    this.isMovingKnob = true;
  }

  /**
   * User released the position knob
   */
  protected async onIonKnobMoveEnd(ev: Event) {
    const newProgress = (ev as RangeCustomEvent).detail.value as number;
    this.isMovingKnob = false;
    this.progress = newProgress;
    if (this.status === PlayerStatusEnum.Playing) {
      return this.play(newProgress);
    }
  }

}
