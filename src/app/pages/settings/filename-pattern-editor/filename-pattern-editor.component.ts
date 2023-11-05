import { Subscription } from 'rxjs';
import { FILENAME_PATTERN_DEFAULT, Recording } from 'src/app/models/recording';
import { RecordingsService } from 'src/app/services/recordings.service';
import { SettingsService } from 'src/app/services/settings.service';
import { AndroidSAF, ErrorCode } from 'src/plugins/capacitorandroidsaf';
import { Component, ElementRef, Input, OnInit } from '@angular/core';
import { ModalController, Platform } from '@ionic/angular';

@Component({
  selector: 'app-filename-pattern-editor',
  templateUrl: './filename-pattern-editor.component.html',
  styleUrls: ['./filename-pattern-editor.component.scss'],
})
export class FilenamePatternEditorComponent implements OnInit {

  protected testFilename = '';
  protected testResult = '';
  protected patternError?: string = undefined;

  @Input({ required: true }) pattern!: string;
  public onConfirm?: (pattern: string) => Promise<void>;

  private backSub?: Subscription;

  constructor(
    protected mc: ModalController,
    protected platform: Platform,
    protected ref: ElementRef<HTMLIonModalElement>,
    protected settings: SettingsService,
    protected recordingsSvc: RecordingsService,
  ) {
    // subscribe to hardware back button events
    this.backSub = this.platform.backButton.subscribeWithPriority(10, () => this.cancel());
  }

  ngOnInit() {
    // set own class
    this.ref.nativeElement.parentElement?.classList.add('tag-editor');
    // first validation
    this.validatePattern();
  }

  async ionViewWillLeave() {
    this.backSub?.unsubscribe();
  }

  default() {
    this.pattern = FILENAME_PATTERN_DEFAULT;
    this.validatePattern();
  }

  cancel() {
    this.mc.dismiss();
  }

  async confirm() {
    await this.onConfirm?.(this.pattern);
    this.cancel();
  }

  async selectTestFile() {
    try {
      const res = await AndroidSAF.selectFile();
      this.testFilename = res.displayName;
    }
    catch (error: any) {
      if (error.code !== ErrorCode.ERR_CANCELED) {
        console.error('Error selecting file:', error);
      }
    }
  }

  testPattern() {
    const re = this.settings.getFilenameRegExp( this.pattern);
    this.testResult = JSON.stringify(Recording.extractMetadataFromFilename(this.testFilename, re), null, 2);
  }

  /**
   * Try to create a RegExp instance with current pattern
   */
  validatePattern() {
    try {
      this.patternError = undefined;

      // validate RegExp syntax (will throw exception in case of bad pattern)
      const re = this.settings.getFilenameRegExp( this.pattern);

      // validate BCR vars
      const varsValidation = Recording.validateFilenamePattern(this.pattern);
      this.patternError = varsValidation === true ? undefined : varsValidation;

    } catch (error: any) {
      this.patternError = error.message;
    }

  }

}
