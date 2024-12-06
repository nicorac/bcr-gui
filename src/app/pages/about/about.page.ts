import { Subscription } from 'rxjs';
import { AppRoutesEnum } from 'src/app/app-routing.module';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { IonicBundleModule } from 'src/app/IonicBundle.module';
import { TranslatePipe } from 'src/app/pipes/translate.pipe';
import { I18nService } from 'src/app/services/i18n.service';
import { MessageBoxService } from 'src/app/services/message-box.service';
import { SettingsService } from 'src/app/services/settings.service';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Platform } from '@ionic/angular';
import version from '../../version';

@Component({
  selector: 'app-about',
  standalone: true,
  templateUrl: './about.page.html',
  styleUrls: ['./about.page.scss'],
  imports: [
    HeaderComponent,
    IonicBundleModule,
    TranslatePipe
  ],
})
export class AboutPage {

  private backSub?: Subscription;

  protected version = version;

  protected readonly descData = {
    appName: version.appName,
    bcrLink: version.bcrUri,
  };

  constructor(
    private i18n: I18nService,
    private mbs: MessageBoxService,
    protected platform: Platform,
    protected router: Router,
    protected settings: SettingsService,
  ) {
    // subscribe to hardware back button events
    this.backSub = this.platform.backButton.subscribeWithPriority(10, () => this.router.navigateByUrl(AppRoutesEnum.Main));
  }

  ionViewWillLeave() {
    this.backSub?.unsubscribe();
  }

  /**
   * Clicking 5 times in a row on version label will make the user a developer
   */
  protected async versionClick() {

    const MIN_CLICK_COUNT = 5;

    if (this.versionClickTimeout) {
      clearTimeout(this.versionClickTimeout);
      this.versionClickTimeout = undefined;
    }

    this.versionClickCount++;
    if (this.versionClickCount === MIN_CLICK_COUNT) {
      this.settings.developerMode = !this.settings.developerMode;
      await this.settings.save();
      // notify the user about the change
      await this.mbs.showConfirm({
        header: this.i18n.get('SETTINGS_DEV_SECTION'),
        message: this.i18n.get(this.settings.developerMode ? 'ABOUT_DEV_MODE_ENABLED' : 'ABOUT_DEV_MODE_DISABLED'),
        showCancelButton: false,
        backdropDismiss: false,
        onConfirm: () => {
          // reload page to force translations reload (if needed)
          location.reload();
        },
      });
      this.versionClickCount = 0;
    }
    else {
      this.versionClickTimeout = setTimeout(() => {
        this.versionClickTimeout = undefined;
        this.versionClickCount = 0;
      }, 1000);
    }

  }
  protected versionClickCount = 0;
  private versionClickTimeout: ReturnType<typeof setTimeout> | undefined;

}
