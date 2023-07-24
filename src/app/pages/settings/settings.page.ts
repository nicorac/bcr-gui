import { RecordingsService } from 'src/app/services/recordings.service';
import { Component } from '@angular/core';
import { SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
})
export class SettingsPage {

  constructor(
    protected settings: SettingsService,
    protected recordingsService: RecordingsService,
  ) { }

  async ionViewWillLeave() {
    await this.settings.save();
  }

  selectRecordingsDirectory() {
    this.recordingsService.selectRecordingsDirectory();
  }

}
