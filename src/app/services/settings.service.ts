import { BehaviorSubject } from 'rxjs';
import { AndroidDateTimeSettings } from 'src/plugins/androiddatetimesettings';
import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { FILENAME_PATTERN_TEMPLATES } from '../models/recording';
import { deserializeObject, JsonProperty, serializeObject } from '../utils/json-serializer';
import { SortModeEnum } from '../utils/recordings-sorter';
import { MessageBoxService } from './message-box.service';

export type Appearance = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';
export type AppDateTimeFormat = {
  dateStyle?: Intl.DateTimeFormatOptions['dateStyle'];
  timeStyle?: Intl.DateTimeFormatOptions['timeStyle'];
  customFormat?: string;
  culture?: string;
}
export const DEFAULT_DATE_FORMAT = 'YYYY-MM-DDTHH:mm:ss';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {

  private isInitialized = false;
  private isLoadingSaving = false;

  /**
   * Return true if time is currently set to 12-hours
   * (both by setting a culture that uses this format and/or by forcing it)
   */
  public is12Hours = false;

  @JsonProperty({ mapTo: 'recordingsDirectoryUri' })
  private __rdu: string = '';

  /**
   * Uri of the selected recordingsDirectory
   */
  public get recordingsDirectoryUri(): string {
    return this.__rdu;
  };
  public set recordingsDirectoryUri(directoryUri: string) {
    this.__rdu = directoryUri;
    // clear recordings DB Uri
    this.dbFileUri = undefined;
  }

  /**
   * Uri of the DB file within the selected dir
   */
  @JsonProperty()
  public dbFileUri?: string = '';

  /**
   * Seek size (in seconds)
   */
  @JsonProperty()
  public seekTime: number = 10;

  /**
   * Default country phone prefix
   */
  @JsonProperty()
  public defaultCountryPrefix: string = '';

  /**
   * Custom filename format
   */
  @JsonProperty()
  public filenamePattern: string = FILENAME_PATTERN_TEMPLATES[0].pattern;

  /**
   * Date/time format
   */
  @JsonProperty({ mapTo: 'dateTimeStyle' })
  public dateTimeFormat: AppDateTimeFormat = {
    dateStyle: 'medium',
    timeStyle: 'medium',
    customFormat: DEFAULT_DATE_FORMAT,
  };

  //#region Dark mode management

  /**
   * Configured app appearance (shown in settings page)
   *  true: darkMode enabled
   *  false: darkMode disabled
   *  undefined: use system default
   *
   * NOTE: use setAppearance() to change this value
   */
  @JsonProperty()
  public get appearance(): Appearance {
    return this._appearance;
  };
  public set appearance(value: Appearance) {
    this._appearance = value;
    this.updateModeStatus();
    this.save();
  }
  private _appearance: Appearance = 'system';

  // attach to system settings
  private systemThemeModeChangeDetector?:MediaQueryList;
  private systemThemeMode: Theme = 'dark'; // set dark as default to avoid "light" flash at startup when dark is set

  /**
   * Current darkMode status
   * It's the combination of appAppearance and systemDarkMode
   * NOTE: dark is set as default to avoid "light" flash at app startup
   */
  public themeMode = new BehaviorSubject<Theme>('dark');

  //#endregion

  /**
   * Supported file MIME types
   */
  public readonly supportedTypes: string[] = [
    'audio/flac',
    'audio/mpeg',
    'audio/ogg',
    'audio/x-wav',
    'audio/amr',
    'audio/amr-wb',
    'audio/amr-wb+',
  ];

  /**
   * Recordings list sort mode
   */
  @JsonProperty()
  public recordingsSortMode: SortModeEnum = SortModeEnum.Date_DESC;

  constructor(
    private mbs: MessageBoxService,
  ) {}

  /**
   * Load app settings from storage
   */
  async initialize() {

    // load android settings
    ({ is12Hours: this.is12Hours } = await AndroidDateTimeSettings.is12Hours());

    // load settings
    const { value: jsonContent } = await Preferences.get({ key: 'settings' });
    if (jsonContent) {
      try {
        this.isLoadingSaving = true;
        let jsonObj = JSON.parse(jsonContent);
        deserializeObject(jsonObj, this);
      } catch (error) {
        this.mbs.showError({ error: error, message: 'Error reading settings' });
      } finally {
        this.isLoadingSaving = false;
      }
    }

    // set current Mode value and attach to system appearance changes
    this.systemThemeModeChangeDetector = window.matchMedia('(prefers-color-scheme: dark)');
    this.systemThemeModeChangeDetector.addEventListener('change', (mediaQuery) => {
      this.systemThemeMode = mediaQuery.matches ? 'dark' : 'light';
      this.updateModeStatus();
    });
    this.systemThemeMode = this.systemThemeModeChangeDetector.matches ? 'dark' : 'light';

    // mark initialization as completed and update status
    this.isInitialized = true;
    this.updateModeStatus();

  }

  /**
   * Save app settings to storage
   */
  async save() {
    if (this.isLoadingSaving) return;
    try {
      this.isLoadingSaving = true;
      const jsonObj = serializeObject(this);
      return Preferences.set({ key: 'settings', value: JSON.stringify(jsonObj) });
    } catch (error) {
      this.mbs.showError({ error, message: 'Error saving settings'});
    } finally {
      this.isLoadingSaving = false;
    }
  }

  /**
   * Update darkMode subject status
   */
  private updateModeStatus() {
    if (this.isInitialized) {
      const isDarkMode = this.appearance === 'system' ? this.systemThemeMode : this.appearance;
      this.themeMode.next(isDarkMode);
    }
  }

}
