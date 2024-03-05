import { Injectable } from '@angular/core';

export type I18nKey = Uppercase<string>;
export type TranslationArgs = number | { [key:string]:(string|number) };

/**
 * Translations are stored in localStorage.
 */
export type CultureContent = Record<I18nKey, string>;

// constants
const LANG_BASE_URL = 'assets/i18n';
const FALLBACK_CULTURE = 'en-US';
const TRANSLATION_KEY_PREFIX = 'trn-';

// Definition of a culture
export type Culture = {
  id: string;
  name: string;
};

/**
 * Provides translations for UI.
 */
@Injectable({
  providedIn: 'root',
})
export class I18nService {

  private _cultureDefs: Culture[] = [];
  private _currentCulture = FALLBACK_CULTURE;

  constructor() { }

  async initialize() {

    // cleanup local storage
    let keys = [];
    for (let i = 0; i < localStorage.length; ++i) {
      let key = localStorage.key(i);
      if (key?.startsWith(TRANSLATION_KEY_PREFIX)) {
        keys.push(key);
      }
    }
    keys.forEach(key => localStorage.removeItem(key));

    // load defined cultures
    this._cultureDefs = await this.getJsonContent(`${LANG_BASE_URL}/_cultures.json`);
  }

  /**
   * Test if the given culture is available on this machine
   */
  isCultureAvailable(culture: string): boolean {
    return !!this._cultureDefs.find(c => c.id === culture);
  }

  /**
   * Return the name of the given culture
   */
  getCultureName(culture: string): string {
    return this._cultureDefs.find(c => c.id === culture)?.name ?? '';
  }

  /**
   * Load the translations for the given culture.
   *
   * Culture can be loaded temporarily (i.e. during an assistance session), overriding user settings.
   * If left undefined, then the latest state is restored.
   */
  async load(culture: string) {

    // check if culture is defined, otherwise load the default one
    if (!this.isCultureAvailable(culture)) {
      culture = FALLBACK_CULTURE;
    }

    // prepare content
    let content: CultureContent = {};
    const parseErrors: string[] = [];

    // load fallback language (if fallbackCulture !== culture)
    if (culture !== FALLBACK_CULTURE) {
      content = {
        ...content,
        ...await this.getJsonContent(`${LANG_BASE_URL}/${FALLBACK_CULTURE}.json`),
      }
    }

    // load given culture language
    content = {
      ...content,
      ...await this.getJsonContent(`${LANG_BASE_URL}/${culture}.json`),
    }

    // store content
    Object.entries(content).forEach(([key, value]) => {
      localStorage.setItem(TRANSLATION_KEY_PREFIX + key, value);
    });

  }

  private async getJsonContent<T>(filename: string): Promise<T> {
    return await (await fetch(filename)).json();
  }

  /**
   * Returns a translated string, optionally replacing "%value%" with a parameter value.
   *
   * @param code    Code of the translation item to return
   *
   * @param values   Translation parameter
   *    If translated string LBL_XXX === "Last %value% days", then
   *    this.langService.get('LBL_XXX', { value: 3 }) returns "Last 3 days"
   *
   *    'values' parameter could also be a single numberic value;
   *    if so, a more specific translation based on its value is searched in this order:
   *    <code>_0: translation for value === 0
   *    <code>_1: translation for value === 1
   *    <code>_N: translation for (value < 0 || value > 1)
   *    and translation could contain the %value% placeholder.
   */
  get(code: I18nKey, values?: TranslationArgs): string {

    // key to search for
    const key = TRANSLATION_KEY_PREFIX + code;

    let res: string|undefined;

    // convert single value to object values
    if (typeof values === 'number') {
      values = { value: values };
    }

    // extract 'value' property
    if (values) {
      let val: number|undefined;
      if (values['value'] !== undefined && typeof values['value'] === 'number') {
        val = +values['value'];
        if (val === 0) {
          res = localStorage.getItem(key + '#0') ?? undefined;
        } else if (val === 1) {
          res = localStorage.getItem(key + '#1') ?? undefined;
        } else {
          res = localStorage.getItem(key + '#N') ?? undefined;
        }
      }
    }

    // if specific translation is missing, fallback to not-specific one
    if (!res) {
      res = localStorage.getItem(key) ?? undefined;
    }

    // replace parameter(s) value
    if (res && values) {
      for (let key in values) {
        const regex = new RegExp(`%${key}%`);
        res = res.replace(regex, values[key]?.toString() ?? '*null*');
      }
    }

    return res ?? `{{${code}}}`;
  }

  /**
   * Return defined cultures
   */
  getDefinedCultures(): Culture[] {
    return this._cultureDefs;
  }

  /**
   * Return the currently loaded culture
   */
  get currentCulture(): string {
    return this._currentCulture;
  }

}
