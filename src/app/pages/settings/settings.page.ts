import { SortMode } from 'src/app/pipes/recordings-sort.pipe';
import { MessageBoxService } from 'src/app/services/message-box.service';
import { RecordingsService } from 'src/app/services/recordings.service';
import { Component } from '@angular/core';
import { SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
})
export class SettingsPage {

  SortMode = SortMode;

  constructor(
    private mbs: MessageBoxService,
    protected settings: SettingsService,
    protected recordingsService: RecordingsService,
  ) { }

  async ionViewWillLeave() {
    await this.save();
  }

  async save() {
    await this.settings.save();
  }

  selectRecordingsDirectory() {
    this.recordingsService.selectRecordingsDirectory();
  }

  clearCache() {
    this.mbs.showConfirm({
      header: 'Clear cache',
      message: 'Do you really want to clear the cache and reload all recordings?',
      onConfirm: () => {
        this.recordingsService.refreshContent(true);
      }
    });
  }

}
