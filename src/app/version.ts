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
  readonly copyright = "Claudio Nicora (nicorac) 2023";
  readonly websiteUri = "https://coolsoft.altervista.org";
  readonly sourcesUri = "https://github.com/nicorac/bcr-gui";

  // read version
  async initialize() {
    const ver = await App.getInfo();
    this._appName = ver.name;
    this._version = ver.version;
  }

}

let version = new versionClass();
export default version;
