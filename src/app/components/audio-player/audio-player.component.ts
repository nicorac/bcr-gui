
import { Recording } from 'src/app/models/Recording';
import { ChangeDetectorRef, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { NativeAudio } from '@capacitor-community/native-audio';
import { AlertController, RangeCustomEvent } from '@ionic/angular';

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

  // play update interval
  private updateInterval?: ReturnType<typeof setInterval>;

  // inputs
  @Input({ required: true }) recording!: Recording;

  // props
  get fileUri() { return this.recording.file.uri; }
  get assetId() { return this.recording.file.uri; }


  constructor(
    private alertController: AlertController,
    private cdr: ChangeDetectorRef,
  ) { }

  async ngOnInit() {

    try {

      // ensure to unload audio file (useful in debug when page refreshes...)
      await this.unload();

      // subscribe to playComplete event
      NativeAudio.addListener(
        'complete',
        (res) => {
          if (res.assetId === this.fileUri) {
            this.stopUpdateInterval();
            this.status = PlayerStatusEnum.Paused;
            this.progress = 0;
            this.cdr.detectChanges(); // workaround needed to let Angular update values...
          }
        }
      );

      // preload audio
      await NativeAudio.preload({
        assetId: this.fileUri,
        assetPath: this.fileUri,
        isUrl: false,
      });

      // get audio duration
      const res = await NativeAudio.getDuration({ assetId: this.fileUri });
      this.duration = Math.ceil(res.duration);
      this.ready = true;

      // set duration to recording item
      // (if not already set with JSON metadata file)
      if (!this.recording.duration) {
        this.recording.duration = this.duration;
      }

    } catch (error: any) {
      this.showError(error.message);
    }

  }

  async ngOnDestroy() {
    // release asset
    await this.unload();
  }

  /**
   * Release loaded media file
   */
  private async unload() {
    await NativeAudio.unload({ assetId: this.fileUri });
  }

  /**
   * Start a JS interval to update player status
   */
  startUpdateInterval() {
    this.stopUpdateInterval();
    this.updateInterval = setInterval(() => {
      NativeAudio.getCurrentTime({ assetId: this.fileUri }).then(res => {
        if (!this.isMovingKnob) {
          this.progress = Math.ceil(res.currentTime);
        }
      });
    }, 500);
  }

  /**
   * Clear update interval
   */
  stopUpdateInterval() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
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
    return NativeAudio.play({ assetId: this.fileUri, time: position })
      .then(_ => {
        this.status = PlayerStatusEnum.Playing;
        this.startUpdateInterval();
      })
      .catch(error => this.showError(error.message));
  }

  /**
   * Pause the playing media file
   */
  async pause() {
    if (this.status !== PlayerStatusEnum.Playing) {
      throw new Error('Not playing...');
    }
    this.stopUpdateInterval();
    return NativeAudio.pause({ assetId: this.fileUri })
      .then(_ => this.status = PlayerStatusEnum.Paused)
      .catch(error => this.showError(error.message));
  }

  /**
   * User started dragging the position knob
   */
  onIonKnobMoveStart(_ev: Event) {
    this.isMovingKnob = true;
  }

  /**
   * User released the position knob
   */
  async onIonKnobMoveEnd(ev: Event) {
    const newProgress = (ev as RangeCustomEvent).detail.value as number;
    this.isMovingKnob = false;
    this.progress = newProgress;
    if (this.status === PlayerStatusEnum.Playing) {
      return this.play(newProgress);
    }
  }

}
