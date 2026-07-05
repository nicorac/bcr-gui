import { Subscription } from 'rxjs';
import { AppRoutesEnum } from 'src/app/app-routing.module';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { IonicBundleModule } from 'src/app/IonicBundle.module';
import { DatetimePipe } from 'src/app/pipes/datetime.pipe';
import { TranslatePipe } from 'src/app/pipes/translate.pipe';
import { I18nService } from 'src/app/services/i18n.service';
import { MessageBoxService } from 'src/app/services/message-box.service';
import { RecordingsService } from 'src/app/services/recordings.service';
import { SortModeEnum } from 'src/app/utils/recordings-sorter';
import version from 'src/app/version';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { ModalController, Platform } from '@ionic/angular';
import { CapacitorAppRestart } from '@kristianheljas/capacitor-app-restart';
import { SettingsService } from '../../services/settings.service';
import { DatetimeFormatEditorComponent } from './datetime-format-editor/datetime-format-editor.component';
import { FilenamePatternEditorComponent } from './filename-pattern-editor/filename-pattern-editor.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  templateUrl: './settings.page.html',
  styleUrls: ['./shared.scss', './settings.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    HeaderComponent,
    IonicBundleModule,
    TranslatePipe,
  ],
  providers: [
    DatetimePipe,
  ]
})
export class SettingsPage {

  protected SortMode = SortModeEnum;
  protected version = version;

  protected editor?: HTMLIonModalElement;

  private backSub?: Subscription;

  public readonly IMPORT_EXPORT_FILENAME = "bcr-gui.settings.json";

  constructor(
    private dtp: DatetimePipe,
    protected i18n: I18nService,
    protected messageBoxService: MessageBoxService,
    protected modalController: ModalController,
    protected platform: Platform,
    protected recordingsService: RecordingsService,
    protected router: Router,
    protected settings: SettingsService,
  ) {
    // subscribe to hardware back button events
    this.backSub = this.platform.backButton.subscribeWithPriority(10, () => this.router.navigateByUrl(AppRoutesEnum.Main));
  }

  async ionViewWillLeave() {
    this.backSub?.unsubscribe();
    await this.save();
  }

  async save() {
    await this.settings.save();
  }

  protected selectRecordingsDirectory() {
    this.recordingsService.selectRecordingsDirectory(() => this.recordingsService.initialize());
  }

  /**
   * Import settings from an external file
   */
  protected importSettings($event: Event) {
    console.warn($event);
    const input = $event.target as HTMLInputElement;

    // Check if the user selected at least one file
    if (!input.files || input.files.length === 0) {
      return;
    }
    const file = input.files[0];
    const reader = new FileReader();

    // Setup the async onload handler before reading
    reader.onload = async () => {
      const fileContent = reader.result as string;
      // test if it's a valid JSON
      try {
        const jsonObj = JSON.parse(fileContent);
      } catch (ex: any) {
        this.messageBoxService.showError({
          header: this.i18n.get('SETTINGS_IMPEXP_IMPORT_ERROR_TITLE'),
          error: ex,
        });
        return;
      }
      // import the content as new settings
      await this.settings.save(fileContent);
      // The await above doesn't guarantee that the native bridge has completed the save operation,
      // but only that the JS side has completed the call to the native bridge.
      // So we'll show an "useless" MessageBox to let it complete...
      this.messageBoxService.showConfirm({
        header: this.i18n.get('SETTINGS_IMPEXP_IMPORT_SUCCESS_TITLE'),
        confirmText: this.i18n.get('SETTINGS_IMPEXP_IMPORT_RESTART'),
        showCancelButton: false,
        backdropDismiss: false,
        onConfirm: async () => {
          // restart the app
          await CapacitorAppRestart.restartApp();
        },
      });
    };

    reader.onerror = (error) => {
      this.messageBoxService.showError({ error });
    };

    // Trigger the asynchronous text read operation
    reader.readAsText(file, 'UTF-8');
  }

  /**
   * Export settings to an external file
   */
  protected async exportSettings() {

    const serializedSettings = this.settings.getSettings();
    const jsonContent = JSON.stringify(serializedSettings, null, 2);

    // Write the string into a temporary file
    const writeResult = await Filesystem.writeFile({
      path: this.IMPORT_EXPORT_FILENAME,  // The name of the file to be created
      data: jsonContent,                  // The string data to be written into the file
      directory: Directory.Cache,         // Saves to temporary cache directory
      encoding: Encoding.UTF8             // Ensures the string is correctly encoded as text
    });

    // Open the Native Share Sheet passing the file URI
    const body = this.i18n.get('SETTINGS_IMPEXP_EXPORT_BODY', { datetime: this.dtp.transform(new Date()) });
    try {
      await Share.share({
        title: body,  // this is the "text" content of the share (i.e. the message body if you share with Telegram, WhatsApp, etc.)
        url: writeResult.uri,
      });
    } catch (error: any) {
      if (!error.code && !error.data) { //  -> 'Share canceled'
        // User canceled the share action, no need to log this as an error
      }
      else {
        this.messageBoxService.showError({
          error: error,
        });
      }
    }

    // Optional: Delete the temp file from cache after sharing to save space
    await Filesystem.deleteFile({
      path: this.IMPORT_EXPORT_FILENAME,
      directory: Directory.Cache
    });

  }

  /**
   * Open filename format editor modal
   */
  async editFilenameFormat() {

    this.editor = await this.modalController.create({
      component: FilenamePatternEditorComponent,
      backdropDismiss: false,
      componentProps: <FilenamePatternEditorComponent> {
        initialPattern: this.settings.filenamePattern,
        onConfirm: async (pattern: string) => {
          this.settings.filenamePattern = pattern;
          await this.save();
          // ask for rescan
          await this.messageBoxService.showConfirm({
            header: this.i18n.get('SETTINGS_RESCAN_TITLE'),
            message: this.i18n.get('SETTINGS_RESCAN_TEXT'),
            onConfirm: () => this.recordingsService.refreshContent({ forceFilenameParse: true }),
          })
        },
      }
    });
    this.editor.onWillDismiss().then(() => this.editor = undefined);
    this.editor.present();
  }

  /**
   * Open datetime format editor modal
   */
  async editDatetimeFormat() {

    this.editor = await this.modalController.create({
      component: DatetimeFormatEditorComponent,
      backdropDismiss: false,
    });
    this.editor.onWillDismiss().then(() => this.editor = undefined);
    this.editor.present();
  }

  /**
   * Set the default country prefix to settings
   */
  setDefaultCountryPrefix(prefix: string) {
    prefix = prefix.trim();
    if (prefix) {
      if (!prefix.startsWith('+')) {
        prefix = '+' + prefix;
      }
      if (/^\+\d*$/g.test(prefix)) {
        this.settings.defaultCountryPrefix = prefix;
      }
    }
  }

  /**
   * Causes page reload to clear pipes cache (i.e. to update translations...)
   */
  protected clearPipesCache() {
    location.reload();
  }

}
