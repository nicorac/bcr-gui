import { HeaderComponent } from 'src/app/components/header/header.component';
import { IonicBundleModule } from 'src/app/IonicBundle.module';
import { DatetimePipe } from 'src/app/pipes/datetime.pipe';
import { TranslatePipe } from 'src/app/pipes/translate.pipe';
import { I18nKey, I18nService } from 'src/app/services/i18n.service';
import { AppDateTimeFormat, SettingsService } from 'src/app/services/settings.service';
import { NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-datetime-format-editor',
  templateUrl: './datetime-format-editor.component.html',
  styleUrls: ['../shared.scss', './datetime-format-editor.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatetimePipe,
    FormsModule,
    HeaderComponent,
    IonicBundleModule,
    NgIf,
    TranslatePipe,
  ],
})
export class DatetimeFormatEditorComponent {

  // sample datetime (last second of current year)
  protected readonly dateTimeSample = new Date(new Date().getFullYear(), 11, 31, 23, 59, 59);

  protected format = signal<AppDateTimeFormat>({});

  // datetime format elements
  protected readonly DATETIME_FORMAT_ELEMS = [
    'YY',
    'YYYY',
    'M',
    'MM',
    'MMM',
    'MMMM',
    'D',
    'DD',
    'H',
    'HH',
    'h',
    'hh',
    'm',
    'mm',
    's',
    'ss',
    'A',
    'a',
  ];

  constructor(
    protected i18n: I18nService,
    protected mc: ModalController,
    protected settings: SettingsService,
  ) {
    const initVal = <AppDateTimeFormat>{...this.settings.dateTimeFormat };
    // fix datetime styles (undefined can't be set as [value], so we use '*')
    if (!initVal.dateStyle) { initVal.dateStyle = <any>'*' };
    if (!initVal.timeStyle) { initVal.timeStyle = <any>'*' };
    this.format.set(initVal);
   }

  cancel() {
    this.mc.dismiss();
  }

  async confirm() {
    this.settings.dateTimeFormat = this.format();
    // fix datetime styles (undefined can't be set as [value], so we use '*')
    if (this.settings.dateTimeFormat.dateStyle === <any>'*') { this.settings.dateTimeFormat.dateStyle = undefined };
    if (this.settings.dateTimeFormat.timeStyle === <any>'*') { this.settings.dateTimeFormat.timeStyle = undefined };
    // save format
    await this.settings.save();
    location.reload();  // force page reload to clear pipes cache (if date format has changed)
    this.mc.dismiss();
  }

  protected getElementKey(el: string): I18nKey {
    return <I18nKey>('DTF_EDITOR_PH_' + el);
  }

  protected isValid() {
    return this.format().customFormat
      || this.format().dateStyle !== <any>'*'
      || this.format().timeStyle !== <any>'*';
  }

}
