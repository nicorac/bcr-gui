import { Recording } from 'src/app/models/recording';
import { RecordingsService } from 'src/app/services/recordings.service';
import { SettingsService } from 'src/app/services/settings.service';
import { bringIntoView } from 'src/app/utils/scroll';
import { Component, OnInit } from '@angular/core';
import { AlertController } from '@ionic/angular';
import version from '../../version';

@Component({
  selector: 'app-main',
  templateUrl: './main.page.html',
  styleUrls: ['./main.page.scss'],
})
export class MainPage implements OnInit {

  version = version;
  selectedItem?: Recording;

  constructor(
    private alertController: AlertController,
    protected recordingsService: RecordingsService,
    protected settings: SettingsService,
  ) { }

  ngOnInit(): void {
    this.refreshList();
  }

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

  async onActionNotImplemented(item: Recording) {
    const alert = await this.alertController.create({
      header: 'Not yet implemented',
      message: 'This action is not yet implemented...',
      buttons: [ 'OK' ],
    });
    await alert.present();
  }

}
