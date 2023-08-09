import { registerLocaleData } from '@angular/common';
import localeIt from '@angular/common/locales/it';
import { Injectable } from '@angular/core';
import { Device } from '@capacitor/device';
import { Preferences } from '@capacitor/preferences';
import { SortMode } from '../pipes/recordings-sort.pipe';

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
  public recordingsDirectoryUri: string = '';

  /**
   * Supported file types
   */
  public supportedTypes: string[] = [
    'audio/flac',
    'audio/mpeg',
    'audio/ogg',
    'audio/x-wav',
  ];

  /**
   * Recordings list sort mode
   */
  public recordingsSortMode: SortMode = SortMode.Date_DESC;


  constructor() { }

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
      try {
        const storedValues = JSON.parse(value);
        Object.getOwnPropertyNames(this).forEach(pn => {
          if (storedValues.hasOwnProperty(pn)) {
            (<any>this)[pn] = storedValues[pn];
          }
        });
      }
      catch (error) { }
    }

  }

  /**
   * Save app settings to storage
   */
  async save() {
    return Preferences.set({ key: 'settings', value: JSON.stringify(this) });
  }

}
