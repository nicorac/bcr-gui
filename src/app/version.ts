import { App } from '@capacitor/app';

class versionClass {

  // dynamic values
  // these fields are injected at runtime by SettingsService.initialize()
  // set their values in file `android/app/build.gradle`
  private _appName = '';
  get appName(): string { return this._appName };
  private _version = '';
  get version(): string { return this._version };

  // static values
  readonly copyright = "Claudio Nicora (nicorac) 2024";
  readonly websiteUri = "https://coolsoft.altervista.org";
  readonly sourcesUri = "https://github.com/nicorac/bcr-gui";
  readonly addLanguageUri = "https://github.com/nicorac/bcr-gui/issues/99";
  readonly bcrUri = "https://github.com/chenxiaolong/BCR";

  // read version
  async initialize() {
    const ver = await App.getInfo();
    this._appName = ver.name;
    this._version = ver.version;
  }

}

let version = new versionClass();
export default version;
