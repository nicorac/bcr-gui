import { BehaviorSubject } from 'rxjs';
import { AndroidSAF } from 'src/plugins/capacitorandroidsaf';
import { Injectable } from '@angular/core';
import { AlertController, IonicSafeString } from '@ionic/angular';
import { Recording } from '../models/recording';
import { replaceExtension } from '../utils/filesystem';
import { RecordingsCache } from '../utils/recordings-cache';
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
  public refreshProgress = new BehaviorSubject<number>(0);

  constructor(
    private alertController: AlertController,
    private mbs: MessageBoxService,
    protected settings: SettingsService,
  ) {}

  /**
   * Initialize the recordings DB
   */
  async initialize() {

    // read DB from cache
    const cache = await RecordingsCache.load();
    this.recordings.next(cache);

    // check if recordings directory has been selected
    if (!this.settings.recordingsDirectoryUri) {
      this.selectRecordingsDirectory();
    }

  }

  /**
   * Refresh recordings list
   */
  async refreshContent(clearCache: boolean = false) {

    // exit if we're already refreshing
    if (this.refreshProgress.value) {
      return;
    }

    if (!this.settings.recordingsDirectoryUri) {
      this.selectRecordingsDirectory();
      return;
    }

    // immediately send a non-zero progress
    this.refreshProgress.next(0.0001);
    console.log("Reading files in folder:");

    // save current DB and set statuses as 'deleted'
    // (if a file with the same filename won't be found, then DB record must be removed)
    let currentDB: Recording[];
    if (clearCache) {
      currentDB = [];
    }
    else {
      currentDB = this.recordings.value;
      currentDB.forEach(r => r.status = 'deleted');
    }

    try {
      // keep files only (no directories)
      const allFiles = (await AndroidSAF.listFiles({ uri: this.settings.recordingsDirectoryUri }))
        ?.items.filter(i => !i.isDirectory);

      // extract supported audio file types
      const audioFiles = allFiles.filter(i => this.settings.supportedTypes.includes(i.type));

      // parse each audio file and its corresponding (optional) metadata file
      const count = audioFiles.length;

      // no files?
      if (count > 0) {
        let i = 0;
        for (const file of audioFiles) {

          // send progress update
          this.refreshProgress.next(++i / count);

          // check if current audio file already exists in current DB
          const dbRecord = currentDB.find(r => r.file.uri === file.uri);
          if (dbRecord) {
            // mark file as "unchanged" and continue
            dbRecord.status = 'unchanged';
            continue;
          }

          // check if audio file has a corresponding metadata .json file
          const metadataFileName = replaceExtension(file.name, '.json');
          const metadataFile = allFiles.find(i => i.name === metadataFileName);

          // add to currentDB
          currentDB.push(await Recording.createInstance(file, metadataFile));

        }
      }

      // remove deleted files
      currentDB = currentDB.filter(r => r.status !== 'deleted');

      // update collection & cache
      this.recordings.next(currentDB);
      await RecordingsCache.save(currentDB);
      this.refreshProgress.next(0);

    }
    catch(err) {
      console.error(err);
      this.mbs.showError({ message: 'Error updating cache', error: err });
      this.refreshProgress.next(0);
    };

  }

  /**
   * Deletes the given recordings (and their optional JSON metadata)
   */
  async deleteRecording(deleteItems: Recording[]) {

    // shared delete function
    const deleteFileFn = async (uri: string) => {
      try {
        await AndroidSAF.deleteFile({ uri });
        return true;
      }
      catch(err) {
        this.mbs.showError({
          message: 'There was an error while deleting item: ' + uri,
          error: err,
        });
        return false;
      }
    }

    // delete all items
    let tmpDb = this.recordings.value;
    for (const item of deleteItems) {
      if (
        item && await deleteFileFn(item.file.uri)
        && item?.metadataFile && await deleteFileFn(item.metadataFile.uri)
      ) {
        // remove item from DB
        tmpDb = tmpDb.filter(i => i !== item);
      }
    }

    // save db & send update event
    await RecordingsCache.save(tmpDb);
    this.recordings.next(tmpDb);

  }

  /**
   * Show user the SAF directory selection dialog.
   * After successful selection, the DB is refreshed (clearing the cache).
   */
  async selectRecordingsDirectory() {

    const alert = await this.alertController.create({
      header: 'Select recordings directory',
      message: new IonicSafeString(
        `This app needs access to BCR recordings directory.

        If you click <strong>OK</strong>, Android will show you a directory selector.

        Select the recordings directory used by BCR and allow access to its content...`
        .replace(/[\r\n]/g, '<br/>')),
      buttons: [
        'Cancel',
        {
          text: 'OK',
          handler: () => {
            // show directory selector
            AndroidSAF.selectDirectory({})
              .then(res => {
                this.settings.recordingsDirectoryUri = res.selectedUri;
                console.log('Selected directory:', this.settings.recordingsDirectoryUri);
                this.settings.save();
                this.recordings.next([]);
                this.refreshContent(true);
              });
          },
        },
      ],
      backdropDismiss: false,
    });

    await alert.present();
  }

}
