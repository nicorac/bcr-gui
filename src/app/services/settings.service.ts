import { BehaviorSubject } from 'rxjs';
import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { SortMode } from '../pipes/recordings-sort.pipe';
import { FromJSON, Serialized, ToJSON } from '../utils/json-serializer';

export type Appearance = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';
export type AppDateTimeFormat = Pick<Intl.DateTimeFormatOptions, 'dateStyle' | 'timeStyle'>;

@Injectable({
  providedIn: 'root'
})
export class SettingsService {

  private isInitialized = false;

  /**
   * Uri of the selected recordingsDirectory
   */
  @Serialized()
  public recordingsDirectoryUri: string = '';

  /**
   * Date/time format
   */
  @Serialized()
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
  @Serialized()
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
  @Serialized()
  public recordingsSortMode: SortMode = SortMode.Date_DESC;


  /**
   * Load app settings from storage
   */
  async initialize() {

    // load settings
    const { value } = await Preferences.get({ key: 'settings' });
    if (value) {
      FromJSON(this, value);
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
    const jsonValue = ToJSON(this);
    return Preferences.set({ key: 'settings', value: jsonValue });
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
