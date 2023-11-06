import { BehaviorSubject } from 'rxjs';
import { AndroidDateTimeSettings } from 'src/plugins/androiddatetimesettings';
import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { FILENAME_PATTERN_DEFAULT, Recording } from '../models/recording';
import { deserializeObject, JsonProperty, serializeObject } from '../utils/json-serializer';
import { SortModeEnum } from '../utils/recordings-sorter';
import { MessageBoxService } from './message-box.service';

export type Appearance = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';
export type AppDateTimeFormat = Pick<Intl.DateTimeFormatOptions, 'dateStyle' | 'timeStyle' >;


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
   * Custom filename format
   */
  @JsonProperty()
  public filenamePattern: string = FILENAME_PATTERN_DEFAULT;

  /**
   * Date/time format
   */
  @JsonProperty()
  public dateTimeStyle: AppDateTimeFormat = {
    dateStyle: 'medium',
    timeStyle: 'medium',
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
   * Supported file types
   */
  public readonly supportedTypes: string[] = [
    'audio/flac',
    'audio/mpeg',
    'audio/ogg',
    'audio/x-wav',
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

  /**
   * Build and return the pattern of a RegEx to be used
   * to parse recording filename based on given pattern (or current config)
   */
  public getFilenameRegExpPattern(pattern: string = this.filenamePattern): string {

    const vars = Recording.getFilenamePatternVars(pattern);

    // transform each format var in a RegEx capture pattern
    for (const v of vars) {

      let replacement = '';

      // get var pattern
      switch (v) {
        case 'date':
          // --> 20230523_164658.998+0200
          replacement = String.raw`(?<date>\d{8}_\d{6}\.\d{3}[+-]\d{4})`;
          break;
        case 'direction':
          // --> in|out|
          replacement = String.raw`(?<direction>in|out|conference)`;
          break;
        case 'phone_number':
          // --> +39123456789
          replacement = String.raw`(?<phone_number>[\d\+\- ]+)`;
          break;
        case 'sim_slot':
          // --> 0|1
          replacement = String.raw`(?<sim_slot>\d+)`;
          break;
          case 'caller_name':
          case 'contact_name':
          case 'call_log_name':
            replacement = String.raw`(?<caller_name>.*)`;
            break;
        default:
          console.warn('Unsupported var:', v);
      }

      pattern = pattern.replace(`{${v}}`, replacement);
    }

    return pattern;

  }

  /**
   * Build and return a RegEx to be used
   * to parse recording filename based on given pattern (or current config)
   */
  public getFilenameRegExp(pattern: string = this.filenamePattern): RegExp {
    // NOTE: NO "g" option here, because we need to reuse this RegExp multiple times!
    return new RegExp(this.getFilenameRegExpPattern(pattern));
  }

}
