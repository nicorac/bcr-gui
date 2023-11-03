import { FILENAME_PATTERN_DEFAULT, Recording } from 'src/app/models/recording';
import { RecordingsService } from 'src/app/services/recordings.service';
import { SettingsService } from 'src/app/services/settings.service';
import { AndroidSAF, ErrorCode } from 'src/plugins/capacitorandroidsaf';
import { Component, ElementRef, Input, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-filename-pattern-editor',
  templateUrl: './filename-pattern-editor.component.html',
  styleUrls: ['./filename-pattern-editor.component.scss'],
})
export class FilenamePatternEditorComponent implements OnInit {

  protected testFilename = '';
  protected testResult = '';

  @Input({ required: true })
  pattern!: string;

  public onConfirm?: (pattern: string) => Promise<void>;

  constructor(
    protected mc: ModalController,
    protected ref: ElementRef<HTMLIonModalElement>,
    protected settings: SettingsService,
    protected recordingsSvc: RecordingsService,
  ) { }

  ngOnInit() {
    // set own class
    this.ref.nativeElement.parentElement?.classList.add('tag-editor');
  }

  default() {
    this.pattern = FILENAME_PATTERN_DEFAULT;
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
    const re = new RegExp(this.settings.getFilenameRegExPattern());
    this.testResult = JSON.stringify(Recording.extractMetadataFromFilename(this.testFilename, re), null, 2);
  }

}
