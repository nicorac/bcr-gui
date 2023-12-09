import { HeaderComponent } from 'src/app/components/header/header.component';
import { DatetimePipe } from 'src/app/pipes/datetime.pipe';
import { AppDateTimeFormat, SettingsService } from 'src/app/services/settings.service';
import { NgIf } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';

@Component({
  selector: 'app-datetime-format-editor',
  templateUrl: './datetime-format-editor.component.html',
  styleUrls: ['./datetime-format-editor.component.scss'],
  standalone: true,
  imports: [
    DatetimePipe,
    FormsModule,
    HeaderComponent,
    IonicModule,
    NgIf
  ],
})
export class DatetimeFormatEditorComponent {

  protected mode: 'predefined'|'custom' = 'predefined';

  // sample datetime (last second of current year)
  protected readonly dateTimeSample = new Date(new Date().getFullYear(), 11, 31, 23, 59, 59);

  protected format!: AppDateTimeFormat;

  constructor(
    protected mc: ModalController,
    protected settings: SettingsService,
  ) {
    // clone current format
    this.format = {...this.settings.dateTimeFormat };
  }

  cancel() {
    this.mc.dismiss();
  }

  async confirm() {
    // Need to re-create the whole object to force pipes update
    this.settings.dateTimeFormat = { ...this.format };
    await this.settings.save();
    location.reload();  // force page reload to clear pipes cache (if date format has changed)
    this.cancel();
  }

}
