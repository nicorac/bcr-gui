import { Subscription } from 'rxjs';
import { ChangeDetectionStrategy, Component, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonModal, IonTextarea, ModalController, Platform } from '@ionic/angular';
import { TranslatePipe } from '@pipes/translate.pipe';
import { IonicBundleModule } from '@src/app/IonicBundle.module';
import { FILENAME_PATTERN_SUPPORTED_VARS, FILENAME_PATTERN_TEMPLATES, Recording } from '@src/app/models/recording';
import { I18nKey, I18nService } from '@src/app/services/i18n.service';
import { AndroidSAF, ErrorCode } from '@src/plugins/androidsaf';

@Component({
  selector: 'app-filename-pattern-editor',
  templateUrl: './filename-pattern-editor.component.html',
  styleUrls: ['../shared.scss', './filename-pattern-editor.component.scss'],
  imports: [FormsModule, IonicBundleModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilenamePatternEditorComponent implements OnInit {

  protected FILENAME_PATTERN_TEMPLATES = FILENAME_PATTERN_TEMPLATES;
  protected testFilename = signal('');
  protected testResult = signal('');
  protected pattern = signal('');
  protected patternError = signal<string | undefined>(undefined);

  // injected by caller
  public initialPattern = '';
  public onConfirm?: (pattern: string) => Promise<void>;

  // internal refs
  private backSub?: Subscription;
  private patternField = viewChild.required<IonTextarea>('patternField');
  private placeholdersModal = viewChild.required<IonModal>('placeholdersModal');
  private templateLoadModal = viewChild.required<IonModal>('templateLoadModal');

  // services
  private i18n = inject(I18nService);
  private mc = inject(ModalController);
  private platform = inject(Platform);
  private ref = inject(ElementRef<HTMLIonModalElement>);

  protected placeholders = FILENAME_PATTERN_SUPPORTED_VARS.map((key) => {
    let val: Record<string, string> | undefined;
    switch (key) {
      case 'direction':
        val = { values: "'in' | 'out' | 'conference'" };
        break;
      default:
        val = undefined;
    }
    return {
      text: `{${key}}`,
      description: this.i18n.get(`FNP_EDITOR_VAR_${key}` as I18nKey, val),
    };
  });

  constructor() {
    // subscribe to hardware back button events
    this.backSub = this.platform.backButton.subscribeWithPriority(10, () =>
      this.cancel()
    );
  }

  ngOnInit() {
    // set initial pattern
    this.pattern.set(this.initialPattern);
    // set own class
    this.ref.nativeElement.parentElement?.classList.add('tag-editor');
    // first validation
    this.validatePattern();
  }

  async ionViewWillLeave() {
    this.backSub?.unsubscribe();
  }

  protected cancel() {
    this.mc.dismiss();
  }

  protected async confirm() {
    await this.onConfirm?.(this.pattern());
    this.cancel();
  }

  protected async selectTestFile() {
    try {
      const res = await AndroidSAF.selectFile();
      this.testFilename.set(res.displayName);
    } catch (error: any) {
      if (error.code !== ErrorCode.ERR_CANCELED) {
        console.error('Error selecting file:', error);
      }
    }
  }

  protected async insertPlaceholder(ph: string) {
    const txt = await this.patternField().getInputElement();
    let startPos = txt.selectionStart ?? 0;
    let endPos = txt.selectionStart ?? this.pattern.length;
    this.pattern.update(
      (v) => v.substring(0, startPos) + ph + v.substring(startPos + endPos)
    );
    this.placeholdersModal().dismiss();
  }

  protected async loadTemplate(pattern: string) {
    this.pattern.set(pattern);
    this.templateLoadModal().dismiss();
    this.validatePattern();
  }

  protected testPattern() {
    const re = Recording.getFilenameRegExp(this.pattern());
    const obj = Recording.extractMetadataFromFilename(this.testFilename(), re);
    // add a string date value
    (obj as any).call_date = new Date(
      +(obj.timestamp_unix_ms ?? 0)
    ).toISOString();
    this.testResult.set(JSON.stringify(obj, null, 2));
  }

  /**
   * Try to create a RegExp instance with current pattern
   */
  protected validatePattern() {
    try {
      this.patternError.set(undefined);

      // validate RegExp syntax (will throw exception in case of bad pattern)
      const _ = Recording.getFilenameRegExp(this.pattern());

      // validate BCR vars
      const varsValidation = Recording.validateFilenamePattern(this.pattern());
      this.patternError.set(
        varsValidation === true ? undefined : varsValidation
      );
    } catch (error: any) {
      this.patternError.set(error.message);
    }
  }

}
