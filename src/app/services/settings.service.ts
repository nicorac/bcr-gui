import { BehaviorSubject } from 'rxjs';
import { registerLocaleData } from '@angular/common';
import localeIt from '@angular/common/locales/it';
import { Injectable } from '@angular/core';
import { Device } from '@capacitor/device';
import { Preferences } from '@capacitor/preferences';
import { SortMode } from '../pipes/recordings-sort.pipe';
import { FromJSON, Serialized, ToJSON } from '../utils/json-serializer';

export type Appearance = 'system' | 'light' | 'dark';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {

  // device language settings
  public deviceLanguage: string = 'en';   // also used as default
  public deviceCulture: string = 'en-US';
  public readonly supportedLanguages = [ 'en', 'it' ];  // first one is the "fallback"

  /**
   * Uri of the selected recordingsDirectory
   */
  @Serialized()
  public recordingsDirectoryUri: string = '';

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
    this.updateDarkModeStatus();
    this.save();
  }
  private _appearance: Appearance = 'system';

  // attach to system settings
  private systemDarkModeChangeDetector?:MediaQueryList;
  private systemDarkMode = false;

  /**
   * Current darkMode status
   * It's the combination of appAppearance and systemDarkMode
   */
  public darkMode = new BehaviorSubject(false);

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

    // get current device language settings
    const deviceLanguage = (await Device.getLanguageCode()).value;
    if (this.supportedLanguages.includes(deviceLanguage)) {
      // change language from the default english
      this.deviceLanguage = deviceLanguage;
      this.deviceCulture = (await Device.getLanguageTag()).value;
    }

    // init Angular lang classes
    switch (deviceLanguage) {
      // predefined, no need to load anything else
      case 'en':
        break;
      case 'it':
        registerLocaleData(localeIt);
        break;
    }

    // load settings
    const { value } = await Preferences.get({ key: 'settings' });
    if (value) {
      FromJSON(this, value);
    }

    // set current darkMode value and attach to system appearance changes
    this.systemDarkModeChangeDetector = window.matchMedia('(prefers-color-scheme: dark)');
    this.systemDarkMode = this.systemDarkModeChangeDetector.matches;
    this.systemDarkModeChangeDetector.addEventListener('change', (mediaQuery) => {
      this.systemDarkMode = mediaQuery.matches;
      this.updateDarkModeStatus();
    });

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
  private updateDarkModeStatus() {
    const isDarkMode = this.appearance === 'system'
      ? this.systemDarkMode
      : this.appearance === 'dark';
    this.darkMode.next(isDarkMode);
  }

}
