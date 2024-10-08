import { AndroidSAF, AndroidSAFUtils, ErrorCode, GetFileUriOptions, ReadFileOptions } from 'src/plugins/androidsaf';
import { Injectable, signal } from '@angular/core';
import { Encoding } from '@capacitor/filesystem';
import { AlertController, IonicSafeString, Platform } from '@ionic/angular';
import { DB_FILENAME, DB_SCHEMA_VERSION, DbContent } from '../models/dbContent';
import { Recording } from '../models/recording';
import { MainPage } from '../pages/main/main.page';
import { replaceExtension } from '../utils/filesystem';
import { deserializeObject, serializeObject } from '../utils/json-serializer';
import { MessageBoxService } from './message-box.service';
import { SettingsService } from './settings.service';

@Injectable({
  providedIn: 'root'
})
export class RecordingsService {

  initialized = false;

  // recordings database
  public recordings = signal<Recording[]>([]);

  // timestamp of last update, used to automatically refresh recording on app resume
  private lastUpdate: number = 0;

  // reference to main page (if active)
  public mainPageRef?: MainPage = undefined;

  /**
   * Refresh status:
   * value === 0    ==> no refresh running
   * 0 < value <=1  ==> refresh progress (%)
   */
  public refreshProgress = signal<number|undefined>(undefined);

  constructor(
    private alertController: AlertController,
    private mbs: MessageBoxService,
    private platform: Platform,
    protected settings: SettingsService,
  ) {}

  /**
   * Initialize the recordings DB
   */
  async initialize() {

    // check if recordings directory has been selected
    if (!this.settings.recordingsDirectoryUri) {
      await this.selectRecordingsDirectory(() => this.initialize());
      return;
    }

    // load existing database from storage
    if (!this.initialized) {
      if (!await this.load() || await this.shallRefresh()) {
        await this.refreshContent();
      }
      this.initialized = true;
    }

    // refresh database when the app is resumed
    this.platform.resume.subscribe(async () => {
      if (await this.shallRefresh()) {
        this.refreshContent();
      }
    });

  }

  /**
   * Refresh recordings list
   */
  async refreshContent(options?: { forceFilenameParse?: boolean }) {

    // exit if we're already refreshing
    if (this.refreshProgress() !== undefined) {
      return;
    }

    if (!this.settings.recordingsDirectoryUri) {
      await this.selectRecordingsDirectory(async () => await this.refreshContent());
      return;
    }

    // immediately send a progress
    this.refreshProgress.set(0.001);
    console.log("Reading files in folder:");

    // filename RegExp parser instance
    const filenameRegExp = Recording.getFilenameRegExp(this.settings.filenamePattern);

    // save current DB in object structure keyed by display name (to speedup search)
    let currentDbObj = Object.fromEntries(this.recordings().map(i => [ i.audioDisplayName, i ]));

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
          this.refreshProgress.set(++i / count);

          // compose metadata .json filename
          const metadataFileName = replaceExtension(file.displayName, '.json');
          const metadataFile = metadataFilesObj[metadataFileName];

          // check if current audio file already exists in current DB (compare display names)
          const dbRecord = currentDbObj[file.displayName];
          if (dbRecord) {
            // file already exists, update Uris (selected dir could have changed...)
            dbRecord.audioUri = file.uri;
            dbRecord.metadataUri = metadataFile?.uri;
            // if file doesn't have JSON metadata and forceFilenameParse === true, then reparse filename
            if (!dbRecord.metadataUri && options?.forceFilenameParse) {
              dbRecord.reparseFilename(file.displayName, filenameRegExp);
            }
            continue;
          }
          else {
            // add new element to DB
            currentDbObj[file.displayName] = await Recording.createInstance(file, metadataFile, filenameRegExp);
          }

        }
      }

      // update collection & cache
      this.lastUpdate = new Date().getTime();
      this.recordings.set(Object.values(currentDbObj));
      await this.save();

    }
    catch(error: any) {
      if (error.code === ErrorCode.ERR_INVALID_URI) {
        this.selectRecordingsDirectory(() => this.refreshContent());
      }
      else {
        console.error(error);
        this.mbs.showError({
          appErrorCode: 'ERR_DB001',
          error
        });
      }
    }
    finally {
      this.refreshProgress.set(undefined);
    }

  }

  /**
   * Test if directory was last modified after last update
   * @returns
   */
  private async shallRefresh() {
    // get directory last update
    var lastModified = -1;
    if (this.settings.recordingsDirectoryUri) {
      ({ lastModified } = await AndroidSAF.getLastModified({ directoryUri: this.settings.recordingsDirectoryUri }));
    }
    //console.warn(`this.lastUpdate < lastModified = ${this.lastUpdate < lastModified} (${this.lastUpdate}, ${lastModified})`);
    return this.lastUpdate < lastModified;
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
          appErrorCode: 'ERR_OS004',
          appErrorArgs: { filename: fileUri },
          error: err,
        });
        return false;
      }
    }

    // delete all items
    let tmpDb = this.recordings();
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
    this.recordings.set(tmpDb);
    await this.save();

  }

  /**
   * Show user the SAF directory selection dialog.
   * After successful selection, the DB is refreshed (clearing the cache).
   */
  async selectRecordingsDirectory(afterSelect?: () => void) {

    // TODO: fix!
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
          handler: async () => {
            // show directory selector
            try {
              const { selectedUri } = await AndroidSAF.selectDirectory({});
              console.log('Selected directory:', this.settings.recordingsDirectoryUri);
              this.settings.recordingsDirectoryUri = selectedUri;
              this.updateDbFileUri()
              await this.settings.save();
              this.initialized = false;
              afterSelect?.();
            }
            catch (error: any) {
              if (error.code !== ErrorCode.ERR_CANCELED) {
                this.mbs.showError({
                  appErrorCode: 'ERR_OS005',
                  error,
                })
                console.error('Error selecting directory:', error);
              }
            }
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
  private async load(): Promise<boolean> {

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

          // check DB version
          if (dbContent.schemaVersion < DB_SCHEMA_VERSION) {
            this.upgradeDb(dbContent);
            await this.save();
          }

          // return DB
          this.lastUpdate = dbContent.lastUpdate;
          this.recordings.set(dbContent.data);
          return true;
        }
        catch (error: any) {
          if (error.code === ErrorCode.ERR_NOT_FOUND) {
            // db file is configured but missing, maybe directory was moved
            // let's search for it again
            await this.updateDbFileUri();
            if (this.settings.recordingsDirectoryUri) {
              // recall
              return await this.load();
            }
          }
          else {
            this.mbs.showError({
              appErrorCode: 'ERR_DB002',
              error,
            });
          }
        }
      }

    } catch (error) {
      this.mbs.showError({
        appErrorCode: 'ERR_DB002',
        error,
      });
    }

    return false;
  }

  /**
   * Save the recordings database to storage
   */
  public async save() {

    try {
      // serialize data
      const dbContent = new DbContent(this.recordings(), this.lastUpdate);
      const jsonObj = serializeObject(dbContent);

      // test if file already exists
      if (!this.settings.dbFileUri) {
        await this.updateDbFileUri();
      }
      // file still does not exist, create a new one
      if (!this.settings.dbFileUri) {
        const { fileUri: dbUri } = await AndroidSAF.createFile({
          directoryUri: this.settings.recordingsDirectoryUri,
          name: DB_FILENAME,
          encoding: Encoding.UTF8,
          content: '',
        })
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
        appErrorCode: 'ERR_DB003',
        error,
      });
    }

  }

  /**
   * Set the given opName to all recordings with the given phone number
   */
  public async setNameByNumber(phoneNumber: string, name: string) {

    this.recordings()
      .filter(i => i.opNumber === phoneNumber)
      .forEach(i => i.opName = name);

    // notify update
    this.recordings.set(this.recordings());

    // save DB
    await this.save();

  }

  /**
   * Search the DB file in current recordingsDirectoryUri and update settings.
   */
  private async updateDbFileUri() {
    const opt: GetFileUriOptions = {
      directoryUri: this.settings.recordingsDirectoryUri,
      name: DB_FILENAME,
    };
    try {
      this.settings.dbFileUri = (await AndroidSAF.getFileUri(opt)).uri;
    }
    catch (e: any) {
      if (e.code === ErrorCode.ERR_INVALID_URI) {
        this.settings.dbFileUri = undefined;
      }
      else {
        throw e;
      }
    }
    this.settings.save();
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
          this.recordings().forEach(r => {
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
