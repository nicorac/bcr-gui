import { Subscription } from 'rxjs';
import { Recording } from 'src/app/models/recording';
import { DatetimePipe } from 'src/app/pipes/datetime.pipe';
import { ToHmsPipe } from 'src/app/pipes/to-hms.pipe';
import { MessageBoxService } from 'src/app/services/message-box.service';
import { SettingsService } from 'src/app/services/settings.service';
import { AudioPlayer, IBaseParams } from 'src/plugins/audioplayer';
import { ChangeDetectorRef, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { IonicModule, RangeCustomEvent } from '@ionic/angular';

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

  // inputs
  @Input({ required: true }) recording!: Recording;

  // props
  get assetId() { return this.recording.audioUri; }


  constructor(
    private cdr: ChangeDetectorRef,
    private dateTimePipe: DatetimePipe,
    private mbs: MessageBoxService,
    private settings: SettingsService,
  ) { }

  async ngOnInit() {

    try {
      // preload audio file
      await this.preloadAudio();
    } catch (error: any) {
      this.showError(error, 'ngOnInit()');
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

    try {

      this.playerRef = await AudioPlayer.init({
        fileUri: this.recording.audioUri,
        notificationTitle: this.recording.opName,
        notificationText: this.dateTimePipe.transform(this.recording.date, this.settings.dateTimeFormat),
      });

      // subscribe to playComplete event and
      // save reference to listener remove function
      this.removePlayCompletedListener = await AudioPlayer.addListener('playCompleted', (res) => {
        if (res.id === this.playerRef?.id) {
          this.status = PlayerStatusEnum.Paused;
          this.progress = 0;
          this.cdr.detectChanges(); // workaround needed to let Angular update values...
        }
      }).remove;

      // subscribe to update event and
      // save reference to listener remove function
      this.removeUpdateListener = await AudioPlayer.addListener('update', (res) => {
        if (res.id === this.playerRef?.id) {
          this.progress = Math.floor(res.position / 1000);
        }
      }).remove;

      // get audio duration
      this.duration = (await AudioPlayer.getDuration(this.playerRef!)).duration / 1000;

      // set duration to recording item
      // (if not already set with JSON metadata file)
      if (!this.recording.duration) {
        this.recording.duration = this.duration;
      }

      // init complete
      this.ready = true;

      // workaround needed to let Angular update values...
      this.cdr.detectChanges();

    } catch (error) {
      this.showError(error, 'preloadAudio()')
    }

  }

  /**
   * Release loaded audio file
   */
  public async unloadAudio() {

    this.status = PlayerStatusEnum.Paused;
    this.ready = false;

    await AudioPlayer.release(this.playerRef!);
    this.playerRef = undefined;
    await this.removePlayCompletedListener?.();
    this.cdr.detectChanges(); // workaround needed to let Angular update values...

  }

  /**
   * Test if the player is ready to play
   */
  public isReady() { return this.ready };

  /**
   * Show error alert
   */
  private showError(error: any, context: string) {
    this.mbs.showError({
      error: error,
      appErrorCode: 'ERR_PLAYER',
      appErrorArgs: { context: context },
    });
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
  async play(position?: number) {

    if (position === undefined) {
      position = this.progress;
    }

    return AudioPlayer.play({ id: this.playerRef!.id, position: position * 1000 })
      .then(async _ => {
        this.status = PlayerStatusEnum.Playing;
      })
      .catch(error => this.showError(error, 'play()'));
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
      })
      .catch(error => this.showError(error, 'pause()'));
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
