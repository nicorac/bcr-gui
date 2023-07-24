import { BehaviorSubject } from 'rxjs';
import { AndroidSAF } from 'src/plugins/capacitorandroidsaf';
import { Injectable } from '@angular/core';
import { AlertController, IonicSafeString } from '@ionic/angular';
import { BcrRecordingMetadata } from '../models/BcrRecordingMetadata';
import { Recording } from '../models/Recording';
import { stripExtension } from '../utils/filesystem';
import { SettingsService } from './settings.service';

@Injectable({
  providedIn: 'root'
})
export class RecordingsService {

  // recordings database
  public recordings = new BehaviorSubject<Recording[]>([]);

  // status
  public isRefreshing = new BehaviorSubject<boolean>(false);

  constructor(
    private alertController: AlertController,
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
        backdropDismiss​: false,
      });

      await alert.present();
      return;
    }

    this.isRefreshing.next(true);
    console.log("Reading files in folder:");

    try {
      // keep files only
      const allFiles = (await AndroidSAF.listFiles({ uri: this.settings.recordingsDirectoryUri }))
        ?.items.filter(i => i.isFile);

      // extract supported recordings audio files
      const audioFiles = allFiles.filter(i => this.settings.supportedTypes.includes(i.type));

      // map each audio file to a Recording class based on it and its corresponding (optional) metadata file
      const recordings: Recording[] = [];
      for (const i of audioFiles) {

        // test if current file has a corresponding metadata .json file
        const metadataFileName = stripExtension(i.name) + '.json';
        const metadataFile = allFiles.find(i => i.name === metadataFileName);
        let metadata: BcrRecordingMetadata | undefined;

        // load and parse metadata json file content
        if (metadataFile) {
          const { content: metadataFileContent } = await AndroidSAF.readFile({ uri: metadataFile.uri });
          try {
            metadata = JSON.parse(metadataFileContent);
          } catch (error) {
            metadata = undefined;
            console.error(error);
          }
        }
        // add to new files
        recordings.push(Recording.createInstance(i, metadata));
      }

      // update collection
      this.recordings.next(recordings);
      this.isRefreshing.next(false);

    }
    catch(err) {
      console.error(err);
      this.isRefreshing.next(false);
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


}
