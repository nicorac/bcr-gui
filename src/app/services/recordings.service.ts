import { BehaviorSubject } from 'rxjs';
import { AndroidSAF } from 'src/plugins/capacitorandroidsaf';
import { Injectable } from '@angular/core';
import { AlertController, IonicSafeString } from '@ionic/angular';
import { Recording } from '../models/recording';
import { replaceExtension } from '../utils/filesystem';
import { MessageBoxService } from './message-box.service';
import { SettingsService } from './settings.service';

@Injectable({
  providedIn: 'root'
})
export class RecordingsService {

  // recordings database
  public recordings = new BehaviorSubject<Recording[]>([]);

  /**
   * Refresh status:
   * value === 0    ==> no refresh running
   * 0 < value <=1  ==> refresh progress (%)
   */
  public refreshProgress = new BehaviorSubject<number>(-1);

  constructor(
    private alertController: AlertController,
    private mbs: MessageBoxService,
    protected settings: SettingsService,
  ) { }

  /**
   * Refresh recordings list
   */
  async refreshContent() {

    if (!this.settings.recordingsDirectoryUri) {
      const alert = await this.alertController.create({
        header: 'Recordings directory not selected',
        message: new IonicSafeString(
          `This app needs access to BCR recordings directory.

          Click <strong>OK</strong> and Android will show you the default folder-selector.

          Now select the recordings directory used by BCR and allow access to its content...`
          .replace(/[\r\n]/g, '<br/>')),
        buttons: [
          'Cancel',
          {
            text: 'OK',
            handler: () => this.selectRecordingsDirectory(),
          },
        ],
        backdropDismiss: false,
      });

      await alert.present();
      return;
    }

    this.refreshProgress.next(0.0000001); // immediately send a non-zero progress
    console.log("Reading files in folder:");

    try {
      // keep files only (no directories)
      const allFiles = (await AndroidSAF.listFiles({ uri: this.settings.recordingsDirectoryUri }))
        ?.items.filter(i => !i.isDirectory);

      // extract supported audio file types
      const audioFiles = allFiles.filter(i => this.settings.supportedTypes.includes(i.type));

      // compose an array of Recording class instances based on
      // each audio file and its corresponding (optional) metadata file
      const recordings: Recording[] = [];
      const count = audioFiles.length;

      // no files?
      if (count > 0) {
        let i = 0;
        for (const file of audioFiles) {

          // send progress update
          this.refreshProgress.next(++i / count);

          // test if current file has a corresponding metadata .json file
          const metadataFileName = replaceExtension(file.name, '.json');
          const metadataFile = allFiles.find(i => i.name === metadataFileName);

          // add to result array
          recordings.push(await Recording.createInstance(file, metadataFile));

        }
      }

      // update collection
      this.recordings.next(recordings);
      this.refreshProgress.next(0);

    }
    catch(err) {
      console.error(err);
      this.refreshProgress.next(0);
    };

  }

  /**
   * Open Android SAF directory selector to choose recordings dir
   */
  selectRecordingsDirectory() {

    AndroidSAF.selectDirectory({})
      .then(res => {
        this.settings.recordingsDirectoryUri = res.selectedUri;
        console.log('Selected folder:', this.settings.recordingsDirectoryUri);
        this.settings.save();
        this.recordings.next([]);
        this.refreshContent();
      });

  }

  /**
   * Deletes the given recording file and its optional JSON metadata
   */
  async deleteRecording(item: Recording) {

    // shared delete function
    const deleteFileFn = async (uri: string) => {
      try {
        await AndroidSAF.deleteFile({ uri });
      }
      catch(err) {
        this.mbs.showError({
          message: 'There was an error while deleting item: ' + uri,
          error: err,
        });
      }
    }

    item && await deleteFileFn(item.file.uri);
    item?.metadataFile && await deleteFileFn(item.metadataFile.uri);

  }

}
