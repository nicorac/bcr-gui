import { Subscription } from 'rxjs';
import { IonicBundleModule } from 'src/app/IonicBundle.module';
import { Recording } from 'src/app/models/recording';
import { ToHmsPipe } from 'src/app/pipes/to-hms.pipe';
import { MessageBoxService } from 'src/app/services/message-box.service';
import { RecordingsService } from 'src/app/services/recordings.service';
import { SettingsService } from 'src/app/services/settings.service';
import { AudioPlayer } from 'src/plugins/audioplayer';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, effect, input, OnDestroy, OnInit, signal, untracked } from '@angular/core';
import { RangeCustomEvent } from '@ionic/angular';

export enum PlayerStatusEnum {
  Paused = 0,
  Playing = 10,
}

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
  protected progress = signal(0);   // current play position (in integer seconds)
  protected duration = signal(0);   // audio duration in seconds

  // subscriptions
  private _androidEventsSubs = new Subscription();
  private removePlayerReadyListener?: () => Promise<void>;
  private removePlayerUpdateListener?: () => Promise<void>;
  private removePlayCompletedListener?: () => Promise<void>;

  // inputs
  public recording = input.required<Recording>();

  constructor(
    private cdr: ChangeDetectorRef,
    private mbs: MessageBoxService,
    private recordingsService: RecordingsService,
    private settings: SettingsService,
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

        await AudioPlayer.load({
          fileUri: rec.audioUri,
          notificationTitle: rec.opName,
          enableEarpiece: this.settings.enableEarpiece,
          keepAwakeWhenPlaying: this.settings.keepAwakeWhenPlaying,
          // notificationText: this.dateTimePipe.transform(r.date, this.settings.dateTimeFormat),
        });

        // subscribe to player ready event
        this.removePlayerReadyListener = await AudioPlayer.addListener('playerReady', (res) => {
          // get audio duration
          this.duration.set(res.duration / 1000);
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

        // set duration to recording item
        // (if not already set with JSON metadata file)
        if (!rec.duration) {
          rec.duration = this.duration();
          // forcibly save updated recordings DB
          await this.recordingsService.save();
        }

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
  protected async toggle() {
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
   * Set position
   */
  protected async setCurrentPosition(position: number) {
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
  protected async onIonKnobMoveEnd(ev: Event) {
    const newPos = (ev as RangeCustomEvent).detail.value as number;
    // this.progress.set(newPos);
    // if (this.status() === PlayerStatusEnum.Playing) {
      return this.setCurrentPosition(newPos);
    // }
  }

}
