import { Subscription } from 'rxjs';
import { Recording } from 'src/app/models/recording';
import { DatetimePipe } from 'src/app/pipes/datetime.pipe';
import { ToHmsPipe } from 'src/app/pipes/to-hms.pipe';
import { SettingsService } from 'src/app/services/settings.service';
import { AudioPlayer, IBaseParams } from 'src/plugins/audioplayer';
import { ChangeDetectorRef, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { AlertController, IonicModule, RangeCustomEvent } from '@ionic/angular';

export enum PlayerStatusEnum {
  Paused = 0,
  Playing = 10,
}

@Component({
  selector: 'app-audio-player',
  templateUrl: './audio-player.component.html',
  styleUrls: ['./audio-player.component.scss'],
  standalone: true,
  imports: [ DatetimePipe, ToHmsPipe, IonicModule ],
  providers: [ DatetimePipe ],
})
export class AudioPlayerComponent implements OnInit, OnDestroy {

  PlayerStatusEnum = PlayerStatusEnum;

  // player status
  protected ready = false;
  protected status = PlayerStatusEnum.Paused;
  protected progress = 0;   // current play position (in integer seconds)
  protected duration = 0;   // audio duration in seconds
  protected isMovingKnob = false;
  protected playerRef?: IBaseParams;

  // subscriptions
  private _androidEventsSubs = new Subscription();
  private removePlayCompletedListener?: () => Promise<void>;
  private removeUpdateListener?: () => Promise<void>;

  // play update interval
  private updateInterval?: ReturnType<typeof setInterval>;

  // inputs
  @Input({ required: true }) recording!: Recording;

  // props
  get assetId() { return this.recording.audioUri; }


  constructor(
    private alertController: AlertController,
    private cdr: ChangeDetectorRef,
    private dateTimePipe: DatetimePipe,
    private settings: SettingsService,
  ) { }

  async ngOnInit() {

    try {
      // preload audio file
      await this.preloadAudio();
    } catch (error: any) {
      this.showError(error.message);
    }

  }

  async ngOnDestroy() {
    // release asset
    await this.unloadAudio();
    this._androidEventsSubs.unsubscribe();
  }

  /**
   * Preload audio file
   */
  private async preloadAudio() {

    await AudioPlayer.init({
      fileUri: this.recording.audioUri,
      notificationTitle: this.recording.opName,
      notificationText: this.dateTimePipe.transform(this.recording.date, this.settings.dateTimeFormat),
    })
      .then(res => {
        this.playerRef = res;

        // subscribe to playComplete event
        AudioPlayer.addListener('playCompleted', (res) => {
          if (res.id === this.playerRef?.id) {
            this.status = PlayerStatusEnum.Paused;
            this.progress = 0;
            this.cdr.detectChanges(); // workaround needed to let Angular update values...
          }
        }).then(res => {
          // save reference to listener remove function
          this.removePlayCompletedListener = res.remove;
        });

        // subscribe to update event
        AudioPlayer.addListener('update', (res) => {
          if (res.id === this.playerRef?.id) {
            this.progress = Math.floor(res.position / 1000);
          }
        }).then(res => {
          // save reference to listener remove function
          this.removeUpdateListener = res.remove;
        });

        // get audio duration
        AudioPlayer.getDuration(this.playerRef!).then(res2 => {
          this.duration = res2.duration / 1000;

          // set duration to recording item
          // (if not already set with JSON metadata file)
          if (!this.recording.duration) {
            this.recording.duration = this.duration;
          }
          // init complete
          this.ready = true;
        })
      })
      .catch(error => this.showError(error.message));

    // workaround needed to let Angular update values...
    this.cdr.detectChanges();

  }

  /**
   * Release loaded audio file
   */
  public async unloadAudio() {

    await this.stopUpdateInterval();
    this.status = PlayerStatusEnum.Paused;
    this.ready = false;

    await AudioPlayer.release(this.playerRef!);
    this.playerRef = undefined;
    await this.removePlayCompletedListener?.();
    this.cdr.detectChanges(); // workaround needed to let Angular update values...

  }

  /**
   * Start a JS interval to update player status
   */
  private startUpdateInterval() {

    // this.stopUpdateInterval();

    // // start update interval
    // this.updateInterval = setInterval(() => {
    //   AudioPlayer.getCurrentTime(this.playerRef!).then(res => {
    //     if (!this.isMovingKnob) {
    //       this.progress = Math.ceil(res.currentTime / 1000);
    //     }
    //   });
    // }, 500);

  }

  /**
   * Clear update interval
   */
  private stopUpdateInterval() {

    // if (this.updateInterval) {
    //   clearInterval(this.updateInterval);
    // }

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
  protected play(position?: number) {

    if (position === undefined) {
      position = this.progress;
    }

    AudioPlayer.play({ id: this.playerRef!.id, position: position * 1000 })
      .then(async _ => {
        this.status = PlayerStatusEnum.Playing;
        this.startUpdateInterval();
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

    // pause audio
    await AudioPlayer.pause(this.playerRef!)
      .then(_ => {
        this.status = PlayerStatusEnum.Paused;
        this.stopUpdateInterval();
      })
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
