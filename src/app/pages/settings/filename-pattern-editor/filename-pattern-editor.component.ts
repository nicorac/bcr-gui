import { Subscription } from 'rxjs';
import { FILENAME_PATTERN_SUPPORTED_VARS, FILENAME_PATTERN_TEMPLATES, Recording } from 'src/app/models/recording';
import { MessageBoxService } from 'src/app/services/message-box.service';
import { AndroidSAF, ErrorCode } from 'src/plugins/androidsaf';
import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { IonModal, IonTextarea, ModalController, Platform } from '@ionic/angular';

@Component({
  selector: 'app-filename-pattern-editor',
  templateUrl: './filename-pattern-editor.component.html',
  styleUrls: ['./filename-pattern-editor.component.scss'],
})
export class FilenamePatternEditorComponent implements OnInit {

  protected FILENAME_PATTERN_TEMPLATES = FILENAME_PATTERN_TEMPLATES;
  protected testFilename = '';
  protected testResult = '';
  protected patternError?: string = undefined;

  @Input({ required: true }) pattern!: string;
  public onConfirm?: (pattern: string) => Promise<void>;

  private backSub?: Subscription;

  @ViewChild('patternField') private patternField!: IonTextarea;
  @ViewChild('placeholdersModal') private placeholdersModal!: IonModal;
  @ViewChild('templateLoadModal') private templateLoadModal!: IonModal;

  protected placeholders = Object.entries(FILENAME_PATTERN_SUPPORTED_VARS).map(([key, value]) => {
    return {
      text: `{${key}}`,
      description: value,
    }
  });

  constructor(
    private mbs: MessageBoxService,
    private mc: ModalController,
    private platform: Platform,
    private ref: ElementRef<HTMLIonModalElement>,
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

  async insertPlaceholder(ph: string) {
    const txt = await this.patternField.getInputElement();
    let startPos = txt.selectionStart ?? 0;
    let endPos = txt.selectionStart ?? this.pattern.length;
    this.pattern = this.pattern.substring(0, startPos) + ph + this.pattern.substring(startPos + endPos);
    this.placeholdersModal.dismiss();
  }

  async loadTemplate(pattern: string) {
    this.pattern = pattern;
    this.templateLoadModal.dismiss();
  }

  testPattern() {
    const re = Recording.getFilenameRegExp(this.pattern);
    const obj = Recording.extractMetadataFromFilename(this.testFilename, re);
    // add a string date value
    (obj as any).call_date = new Date(+(obj.timestamp_unix_ms ?? 0)).toISOString();
    this.testResult = JSON.stringify(obj, null, 2);
  }

  /**
   * Try to create a RegExp instance with current pattern
   */
  validatePattern() {
    try {
      this.patternError = undefined;

      // validate RegExp syntax (will throw exception in case of bad pattern)
      const re = Recording.getFilenameRegExp(this.pattern);

      // validate BCR vars
      const varsValidation = Recording.validateFilenamePattern(this.pattern);
      this.patternError = varsValidation === true ? undefined : varsValidation;

    } catch (error: any) {
      this.patternError = error.message;
    }

  }

}
