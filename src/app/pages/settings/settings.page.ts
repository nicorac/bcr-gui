import { Subscription } from 'rxjs';
import { AppRoutesEnum } from 'src/app/app-routing.module';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { IonicBundleModule } from 'src/app/IonicBundle.module';
import { TranslatePipe } from 'src/app/pipes/translate.pipe';
import { I18nService } from 'src/app/services/i18n.service';
import { MessageBoxService } from 'src/app/services/message-box.service';
import { RecordingsService } from 'src/app/services/recordings.service';
import { SortModeEnum } from 'src/app/utils/recordings-sorter';
import version from 'src/app/version';
import { BcrGui } from 'src/plugins/bcrgui';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ModalController, Platform } from '@ionic/angular';
import { recorderApps, SettingsService } from '../../services/settings.service';
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
})
export class SettingsPage {

  protected recorderApps = recorderApps;
  protected SortMode = SortModeEnum;
  protected version = version;

  protected editor?: HTMLIonModalElement;

  private backSub?: Subscription;

  constructor(
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

  async onRecorderAppChange() {
    const app = recorderApps.find(app => app.id === this.settings.recorderApp);
    
    // If app not found or has no default pattern, force custom
    if (!this.settings.recorderApp || !this.settings.getRecorderApp()?.filenamePattern) {
      this.settings.useCustomFilenamePattern = true;
    }
    
    await this.save();
  }

  async save() {
    await this.settings.save();
  }

  selectRecordingsDirectory() {
    this.recordingsService.selectRecordingsDirectory(() => this.recordingsService.initialize());
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

  /**
   * Launch external BCR settings activity on Android.
   */
  protected async openBcrSettings() {

    // first try SettingsActivityLauncher
    try {
      await BcrGui.launchActivity({ component: 'com.chiller3.bcr/.settings.SettingsActivityLauncher' });
      return;
    } catch (err: any) {}

    // then try SettingsActivity
    try {
      await BcrGui.launchActivity({
        component: 'com.chiller3.bcr/.settings.SettingsActivity'
      });
      return;
    } catch (err: any) {}

    // fallback to main component
    try {
      await BcrGui.launchActivity({ component: 'com.chiller3.bcr' });
      return;
    } catch (err: any) {}

    // all attempts failed
    this.messageBoxService.showError({
      message: this.i18n.get('SETTINGS_BCR_SETTINGS_NOT_FOUND')
    });

  }

}
