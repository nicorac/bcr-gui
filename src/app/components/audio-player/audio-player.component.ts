import { Subscription } from 'rxjs';
import { IonicBundleModule } from 'src/app/IonicBundle.module';
import { Recording } from 'src/app/models/recording';
import { toHms, ToHmsPipe } from 'src/app/pipes/to-hms.pipe';
import { MessageBoxService } from 'src/app/services/message-box.service';
import { RecordingsService } from 'src/app/services/recordings.service';
import { SettingsService } from 'src/app/services/settings.service';
import { AudioPlayer } from 'src/plugins/audioplayer';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, effect, input, OnDestroy, OnInit, output, signal, untracked } from '@angular/core';
import { RangeCustomEvent } from '@ionic/angular';

export enum PlayerStatusEnum {
  Paused = 0,
  Playing = 10,
}

export type SkipDirection = 'prev' | 'next';

@Component({
  selector: 'app-audio-player',
  templateUrl: './audio-player.component.html',
  styleUrls: ['./audio-player.component.scss'],
  standalone: true,
  imports: [ IonicBundleModule, ToHmsPipe ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AudioPlayerComponent implements OnInit, OnDestroy {

  PlayerStatusEnum = PlayerStatusEnum;

  // player status
  protected ready = signal(false);
  protected status = signal(PlayerStatusEnum.Paused);
  protected progress = signal(0);       // current play position (in integer seconds)
  protected duration = signal(0);       // audio duration in seconds

  // subscriptions
  private _androidEventsSubs = new Subscription();
  private removePlayerReadyListener?: () => Promise<void>;
  private removePlayerUpdateListener?: () => Promise<void>;
  private removePlayCompletedListener?: () => Promise<void>;

  // inputs
  public recording = input.required<Recording>();

  // prev/next buttons
  public previousEnabled = input(false);
  public nextEnabled = input(false);
  public onSkip = output<SkipDirection>();

  // knob
  protected isDraggingKnob = signal(false);

  constructor(
    private cdr: ChangeDetectorRef,
    private mbs: MessageBoxService,
    private recordingsService: RecordingsService,
    protected settings: SettingsService,
  ) {
    effect(() => {
      untracked(async () => await this.unload());
      if (this.recording()) {
        untracked(async () => await this.load(this.recording()));
      }
    });

  }

  async ngOnInit() {

    // try {
    //   // preload audio file
    //   await this.preloadAudio();
    // } catch (error: any) {
    //   this.showError(error, 'ngOnInit()');
    // }

  }

  async ngOnDestroy() {
    // release asset
    await this.unload();
    this._androidEventsSubs.unsubscribe();
  }

  /**
   * Preload audio file
   */
  private async load(rec: Recording) {

    // free resources
    if (this.ready()) {
      await this.unload();
    }

    if (rec) {

      try {

        // test if the selected recording duration field has been filled
        // (duration field is filled asynchronously)
        if ((rec.duration || 0) <= 0) {
          const { duration } = await AudioPlayer.getAudioFileDuration({ fileUri: rec.audioUri });
          rec.duration = duration / 1000;
          // forcibly save updated recordings DB
          await this.recordingsService.save();
        }
        this.duration.set(rec.duration);

        await AudioPlayer.load({
          fileUri: rec.audioUri,
          notificationTitle: rec.opName,
          enableEarpiece: this.settings.enableEarpiece,
          keepAwakeWhenPlaying: this.settings.keepAwakeWhenPlaying,
          // notificationText: this.dateTimePipe.transform(r.date, this.settings.dateTimeFormat),
        });

        // set initial playback speed (if !== 1)
        if (this.settings.playbackSpeed !== 1) {
          await AudioPlayer.setPlaybackSpeed({ playbackSpeed: this.settings.playbackSpeed });
        }

        // subscribe to player ready event
        this.removePlayerReadyListener = await AudioPlayer.addListener('playerReady', async () => {
          this.status.set(PlayerStatusEnum.Paused);
          this.progress.set(0);
          // init complete
          this.ready.set(true);
          this.cdr.detectChanges(); // workaround needed to let Angular update values...
        }).remove;

        // subscribe to playComplete event and
        // save reference to listener remove function
        this.removePlayCompletedListener = await AudioPlayer.addListener('playerCompleted', () => {
          this.status.set(PlayerStatusEnum.Paused);
          this.progress.set(0);
          this.cdr.detectChanges(); // workaround needed to let Angular update values...
        }).remove;

        // subscribe to update event and
        // save reference to listener remove function
        this.removePlayerUpdateListener = await AudioPlayer.addListener('playerUpdate', (res) => {
          this.progress.set(Math.floor(res.position / 1000));
        }).remove;

        // workaround needed to let Angular update values...
        this.cdr.detectChanges();

      } catch (error) {
        this.showError(error, 'initializeplayer()')
      }

    }

  }

  /**
   * Release loaded audio file
   */
  public async unload() {

    this.status.set(PlayerStatusEnum.Paused);
    this.ready.set(false);

    await AudioPlayer.unload();
    await this.removePlayerReadyListener?.();
    await this.removePlayCompletedListener?.();
    await this.removePlayerUpdateListener?.();
    this.cdr.detectChanges(); // workaround needed to let Angular update values...

  }

  /**
   * Test if the player is ready to play
   */
  public isReady() { return this.ready() };

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
  protected async togglePlayPause() {
    if (this.status() === PlayerStatusEnum.Paused) {
      return this.play();
    }
    else {
      return this.pause();
    }
  }

  /**
   * Play the given record file (already loaded with load())
   */
  async play() {

    return AudioPlayer.play()
      .then(async _ => {
        this.status.set(PlayerStatusEnum.Playing);
      })
      .catch(error => this.showError(error, 'play()'));
  }

  /**
   * Fast forward / rewind
   */
  protected async onSeek(delta: number) {
    return this.setCurrentPosition(this.progress() + delta * this.settings.seekTime);
  }

  /**
   * Toggle player speed
   */
  protected async toggleSpeed() {
    switch (this.settings.playbackSpeed) {
      case 1:
        this.settings.playbackSpeed = 1.5;
        break;
      case 1.5:
        this.settings.playbackSpeed = 2;
        break;
      case 2:
        this.settings.playbackSpeed = 1;
        break;
    }
    await AudioPlayer.setPlaybackSpeed({ playbackSpeed: this.settings.playbackSpeed });
    await this.settings.save();
  }

  /**
   * Set position
   */
  protected async setCurrentPosition(position: number) {
    if (!position || position < 0) {
      position = 0;
    }
    AudioPlayer.setCurrentPosition({ position: position * 1000 });
  }

  /**
   * Pause the playing media file
   */
  async pause() {

    if (this.status() !== PlayerStatusEnum.Playing) {
      return;
    }

    // pause audio
    await AudioPlayer.pause()
      .then(_ => {
        this.status.set(PlayerStatusEnum.Paused);
      })
      .catch(error => this.showError(error, 'pause()'));
  }

  /**
   * User released the position knob
   */
  protected async onIonKnobMoveStart(ev: Event) {
    this.isDraggingKnob.set(true);
  }

  /**
   * User is dragging the knob
   */
  protected rangePinFormatter(value: number) {
    return toHms(value);
  }

  /**
   * User released the position knob
   */
  protected async onIonKnobMoveEnd(ev: Event) {
    const newPos = (ev as RangeCustomEvent).detail.value as number;
    this.isDraggingKnob.set(false);
    this.setCurrentPosition(newPos);
    this.progress.set(newPos);
  }

}
