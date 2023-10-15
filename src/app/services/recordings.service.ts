import { BehaviorSubject } from 'rxjs';
import { AndroidSAF, AndroidSAFUtils, GetFileUriOptions, ReadFileOptions } from 'src/plugins/capacitorandroidsaf';
import { Injectable } from '@angular/core';
import { Encoding } from '@capacitor/filesystem';
import { AlertController, IonicSafeString } from '@ionic/angular';
import { DB_FILENAME, DB_SCHEMA_VERSION, DbContent } from '../models/dbContent';
import { Recording } from '../models/recording';
import { replaceExtension } from '../utils/filesystem';
import { deserializeObject, serializeObject } from '../utils/json-serializer';
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

    // check if recordings directory has been selected
    if (!this.settings.recordingsDirectoryUri) {
      await this.selectRecordingsDirectory();
    }
    else {
      // load existing database from storage
      await this.load();
    }

  }

  /**
   * Refresh recordings list
   */
  async refreshContent() {

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

    // save current DB in object structure keyed by display name (to speedup search)
    let currentDbObj = Object.fromEntries(this.recordings.value.map(i => [ i.audioDisplayName, i ]));

    try {
      // keep files only (no directories)
      const allFiles = (await AndroidSAFUtils.listFiles({ directoryUri: this.settings.recordingsDirectoryUri }))?.filter(i => !i.isDirectory);

      // extract supported audio file types and metadata files
      // (use an Object structure to speed up search)
      const audioFilesObj = Object.fromEntries(allFiles.filter(i => this.settings.supportedTypes.includes(i.type)).map(i => [ i.displayName, i ]));
      const metadataFilesObj = Object.fromEntries(allFiles.filter(i => i.displayName.endsWith('.json')).map(i => [ i.displayName, i ]));

      // STEP 1: remove deleted files from DB
      // ------------------------------------
      Object.keys(currentDbObj)
        .filter(fn => !(fn in audioFilesObj))
        .forEach(fn => {
          delete currentDbObj[fn];
        }
      );

      // parse each audio file and its corresponding (optional) metadata file
      const count = Object.keys(audioFilesObj).length;

      // no files?
      if (count > 0) {
        let i = 0;
        for (const file of Object.values(audioFilesObj)) {

          // send progress update
          this.refreshProgress.next(++i / count);

          // compose metadata .json filename
          const metadataFileName = replaceExtension(file.displayName, '.json');
          const metadataFile = metadataFilesObj[metadataFileName];

          // check if current audio file already exists in current DB (compare diplay names)
          const dbRecord = currentDbObj[file.displayName];
          if (dbRecord) {
            // file already exists, update Uris (selected dir could have changed...)
            dbRecord.audioUri = file.uri;
            dbRecord.metadataUri = metadataFile?.uri;
            continue;
          }
          else {
            // add new element to DB
            currentDbObj[file.displayName] = await Recording.createInstance(this.settings.recordingsDirectoryUri, file, metadataFile);
          }

        }
      }

      // update collection & cache
      this.recordings.next(Object.values(currentDbObj));
      await this.save();
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
    const deleteFileFn = async (fileUri: string) => {
      try {
        await AndroidSAF.deleteFile({ fileUri });
        return true;
      }
      catch(err) {
        this.mbs.showError({
          message: 'There was an error while deleting item: ' + fileUri,
          error: err,
        });
        return false;
      }
    }

    // delete all items
    let tmpDb = this.recordings.value;
    for (const item of deleteItems) {
      if (
        item && await deleteFileFn(item.audioUri)
        && (!item.metadataUri || (item?.metadataUri && await deleteFileFn(item.metadataUri)))
      ) {
        // remove item from DB
        tmpDb = tmpDb.filter(i => i !== item);
      }
    }

    // send update event & save DB
    this.recordings.next(tmpDb);
    await this.save();

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
              .then(async res => {
                console.log('Selected directory:', this.settings.recordingsDirectoryUri);
                this.settings.recordingsDirectoryUri = res.selectedUri;
                await this.settings.save();
                // try to load the DB from selected folder
                // (it will fallback to refreshContent() if database is missing)
                await this.load();
              });
          },
        },
      ],
      backdropDismiss: false,
    });

    await alert.present();
  }

  /**
   * Load recordings database from storage
   */
  private async load() {

    try {

      // test if DB file exists, then load it
      if (this.settings.dbFileUri) {
        const dbContent = new DbContent();
        try {
          const opt: ReadFileOptions = {
            fileUri: this.settings.dbFileUri,
            encoding: Encoding.UTF8,
          };
          const { content: jsonContent } = await AndroidSAF.readFile(opt);
          const jsonObj = JSON.parse(jsonContent);
          deserializeObject(jsonObj, dbContent);
        } catch (error) {
          this.mbs.showError({ error, message: 'Error reading database content' });
        }

        // check DB version
        if (dbContent.schemaVersion < DB_SCHEMA_VERSION) {
          this.upgradeDb(dbContent);
          this.save();
        }

        // return DB
        this.recordings.next(dbContent.data);
      }
      else {
        // refresh content
        await this.refreshContent();
      }

    } catch (error) {
      this.mbs.showError({
        message: 'Error loading database',
        error,
      });
    }

  }

  /**
   * Save the recordings database to storage
   */
  public async save() {

    try {
      // serialize data
      const dbContent = new DbContent(this.recordings.value);
      const jsonObj = serializeObject(dbContent);

      // test if file already exists
      if (!this.settings.dbFileUri) {
        const opt: GetFileUriOptions = {
          directoryUri: this.settings.recordingsDirectoryUri,
          name: DB_FILENAME,
        };
        let dbUri = (await AndroidSAF.getFileUri(opt)).uri;

        // file does not exist, create a new one
        if (!dbUri) {
          const { fileUri: dbUri } = await AndroidSAF.createFile({
            ...opt,
            encoding: Encoding.UTF8,
            content: '',
          })
        }
        this.settings.dbFileUri = dbUri;
        await this.settings.save();
      }

      // write content
      await AndroidSAF.writeFile({
        fileUri: this.settings.dbFileUri!,
        content: JSON.stringify(jsonObj),
        encoding: Encoding.UTF8,
      });

    } catch (error) {
      this.mbs.showError({
        message: 'Error saving database',
        error,
      });
    }

  }

  /**
   * Upgrade DB version
   */
  private upgradeDb(dbContent: DbContent) {

    while (dbContent.schemaVersion < DB_SCHEMA_VERSION) {

      switch (dbContent.schemaVersion) {

        /**
         * ====================
         * Upgrade ver. 1 --> 2
         * ====================
         * recording.audioFile --> recording.audioDisplayName
         * (new audioUri/metadataUri props will be populated at next refresh)
         */
        case 1:
          this.recordings.value.forEach(r => {
            r.audioDisplayName = (<any>r)['audioFile'];
          });
          dbContent.schemaVersion = 2;
          break;

        // // upgrade ver. 2 --> 3
        // case 1:
        //   dbContent.schemaVersion = 3;
        //   break;

      }

    }

  }

}
