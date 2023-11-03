import { MessageBoxService } from 'src/app/services/message-box.service';
import { RecordingsService } from 'src/app/services/recordings.service';
import { SortModeEnum } from 'src/app/utils/recordings-sorter';
import { Component } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { AppDateTimeFormat, SettingsService } from '../../services/settings.service';
import { FilenamePatternEditorComponent } from './filename-pattern-editor/filename-pattern-editor.component';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
})
export class SettingsPage {

  SortMode = SortModeEnum;

  protected filenamePatternEditor?: HTMLIonModalElement;

  // sample datetime (last second of current year)
  readonly dateTimeSample = new Date(new Date().getFullYear(), 11, 31, 23, 59, 59);

  constructor(
    protected messageBoxService: MessageBoxService,
    protected modalController: ModalController,
    protected recordingsService: RecordingsService,
    protected settings: SettingsService,
  ) { }

  async ionViewWillLeave() {
    await this.save();
  }

  async save() {
    await this.settings.save();
  }

  selectRecordingsDirectory() {
    this.recordingsService.selectRecordingsDirectory(() => this.recordingsService.initialize());
  }

  /**
   * Need to re-create the whole object to let pipes update
   */
  updateDateTimeStyle(style: string, key: keyof AppDateTimeFormat) {
    this.settings.dateTimeStyle = { ...this.settings.dateTimeStyle, [key]: style === '' ? undefined : style }
  }

  /**
   * Open filename format editor modal
   */
  async editFilenameFormat() {

    this.filenamePatternEditor = await this.modalController.create({
      component: FilenamePatternEditorComponent,
      backdropDismiss: false,
      componentProps: <FilenamePatternEditorComponent> {
        pattern: this.settings.filenamePattern,
        onConfirm: async (pattern: string) => {
          this.settings.filenamePattern = pattern;
          await this.save();
          // ask for rescan
          await this.messageBoxService.showConfirm({
            header: 'Rescan',
            message: 'Do you want to rescan all of your files (without metadata JSON file) using the new filename pattern?',
            confirmText: 'Yes, rescan',
            cancelText: 'No',
            onConfirm: () => this.recordingsService.refreshContent({ forceFilenameParse: true }),
          })
        },
      }
    });
    this.filenamePatternEditor.onWillDismiss().then(() => this.filenamePatternEditor = undefined);
    this.filenamePatternEditor.present();
  }

}
