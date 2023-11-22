import { Subscription } from 'rxjs';
import { AppRoutesEnum } from 'src/app/app-routing.module';
import { MessageBoxService } from 'src/app/services/message-box.service';
import { RecordingsService } from 'src/app/services/recordings.service';
import { SortModeEnum } from 'src/app/utils/recordings-sorter';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { ModalController, Platform } from '@ionic/angular';
import { SettingsService } from '../../services/settings.service';
import { DatetimeFormatEditorComponent } from './datetime-format-editor/datetime-format-editor.component';
import { FilenamePatternEditorComponent } from './filename-pattern-editor/filename-pattern-editor.component';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  // hostDirectives
})
export class SettingsPage {

  SortMode = SortModeEnum;

  protected editor?: HTMLIonModalElement;

  private backSub?: Subscription;

  constructor(
    protected messageBoxService: MessageBoxService,
    protected modalController: ModalController,
    protected platform: Platform,
    protected recordingsService: RecordingsService,
    protected router: Router,
    protected settings: SettingsService,
  ) {
    // subscribe to hardware back button events
    this.backSub = this.platform.backButton.subscribeWithPriority(10, () => this.router.navigateByUrl(AppRoutesEnum.Main));
  }

  async ionViewWillLeave() {
    this.backSub?.unsubscribe();
    await this.save();
  }

  async save() {
    await this.settings.save();
  }

  selectRecordingsDirectory() {
    this.recordingsService.selectRecordingsDirectory(() => this.recordingsService.initialize());
  }

  /**
   * Open filename format editor modal
   */
  async editFilenameFormat() {

    this.editor = await this.modalController.create({
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
    this.editor.onWillDismiss().then(() => this.editor = undefined);
    this.editor.present();
  }

  /**
   * Open datetime format editor modal
   */
  async editDatetimeFormat() {

    this.editor = await this.modalController.create({
      component: DatetimeFormatEditorComponent,
      backdropDismiss: false,
    });
    this.editor.onWillDismiss().then(() => this.editor = undefined);
    this.editor.present();
  }

}
