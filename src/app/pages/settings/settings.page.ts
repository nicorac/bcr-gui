import { TagsDatabaseComponent } from 'src/app/components/tags-database/tags-database.component';
import { SortMode } from 'src/app/pipes/recordings-sort-filter.pipe';
import { RecordingsService } from 'src/app/services/recordings.service';
import { environment } from 'src/environments/environment';
import { Component } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { AppDateTimeFormat, SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
})
export class SettingsPage {

  SortMode = SortMode;
  protected tagsCount = 0;
  private tagEditor?: HTMLIonModalElement;

  // sample datetime (last second of current year)
  readonly dateTimeSample = new Date(new Date().getFullYear(), 11, 31, 23, 59, 59);

  constructor(
    private modalController: ModalController,
    protected settings: SettingsService,
    protected recordingsService: RecordingsService,
  ) {
    this.updateTagsCount()
    if (!environment.production) {
      this.showTagsEditor();
    }
  }

  async ionViewWillLeave() {
    await this.save();
  }

  async save() {
    await this.settings.save();
  }

  selectRecordingsDirectory() {
    this.recordingsService.selectRecordingsDirectory();
  }

  updateTagsCount() {
    this.tagsCount = this.recordingsService.getTagsCount();
  }

  /**
   * Need to re-create the whole object to let pipes update
   */
  updateDateTimeStyle(style: string, key: keyof AppDateTimeFormat) {
    this.settings.dateTimeStyle = { ...this.settings.dateTimeStyle, [key]: style === '' ? undefined : style }
  }

  /**
   * Show tags editor component modal
   */
  protected async showTagsEditor() {

    if (this.tagEditor) return;

    this.tagEditor = await this.modalController.create({
      component: TagsDatabaseComponent,
      backdropDismiss: false,
      componentProps: <TagsDatabaseComponent> {
        // selection: this.selectedTags,
        // confirmHandler: (sel: TagReference[]) => {
        //   // this.selectedTags = sel;
        //   this.selectedTagsChange.next(sel);
        // },
      }
    });
    this.tagEditor.onWillDismiss().then(() => this.tagEditor = undefined);
    this.tagEditor.present();


  }

}
