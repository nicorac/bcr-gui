import { AudioPlayerComponent } from 'src/app/components/audio-player/audio-player.component';
import { Recording } from 'src/app/models/recording';
import { MessageBoxService } from 'src/app/services/message-box.service';
import { RecordingsService } from 'src/app/services/recordings.service';
import { SettingsService } from 'src/app/services/settings.service';
import { bringIntoView } from 'src/app/utils/scroll';
import { Component } from '@angular/core';
import version from '../../version';

@Component({
  selector: 'app-main',
  templateUrl: './main.page.html',
  styleUrls: ['./main.page.scss'],
})
export class MainPage {

  version = version;
  selectedItem?: Recording;

  constructor(
    private mbs: MessageBoxService,
    protected recordingsService: RecordingsService,
    protected settings: SettingsService,
  ) { }

  refreshList() {
    this.recordingsService.refreshContent();
  }

  clearSelection() {
    this.selectedItem = undefined;
  }

  /**
   * Change selected status
   */
  async onItemClick(item: Recording) {

    if (item !== this.selectedItem) {
      this.selectedItem = item;
      bringIntoView('.items .selected');
    }

  }

  /**
   * Deletes the given recording file (and its companion JSON metadata)
   */
  async deleteRecording(item: Recording, player: AudioPlayerComponent) {

    // stop player
    player.pause();

    // show confirmation alert
    await this.mbs.showConfirm({
      header: 'Delete recording?',
      message: 'Do you really want to delete this recording?',
      cancelText: 'Cancel',
      confirmText: 'Delete',
      onConfirm: () => {
        this.recordingsService.deleteRecording(item);
      }
    });

  }

}
