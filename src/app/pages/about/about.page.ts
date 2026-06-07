import { Subscription } from 'rxjs';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Platform } from '@ionic/angular';
import { TranslatePipe } from '@pipes/translate.pipe';
import { I18nService } from '@services/i18n.service';
import { MessageBoxService } from '@services/message-box.service';
import { SettingsService } from '@services/settings.service';
import { AppRoutesEnum } from '@src/app/app-routing.module';
import { HeaderComponent } from '@src/app/components/header/header.component';
import { IonicBundleModule } from '@src/app/IonicBundle.module';
import version from '../../version';

@Component({
  selector: 'app-about',
  templateUrl: './about.page.html',
  styleUrls: ['./about.page.scss'],
  imports: [
    HeaderComponent,
    IonicBundleModule,
    TranslatePipe,
  ]
})
export class AboutPage {

  private _sub?: Subscription;

  protected version = version;

  protected readonly descData = {
    appName: version.appName,
    bcrLink: `<a href="${version.bcrUri}">${version.bcrAppName}</a>`,
  };

  // services
  private i18n = inject(I18nService);
  private mbs = inject(MessageBoxService);
  protected platform = inject(Platform);
  protected router = inject(Router);
  protected settings = inject(SettingsService);

  constructor() {
    // subscribe to hardware back button events
    this._sub = this.platform.backButton.subscribeWithPriority(10, () => this.router.navigateByUrl(AppRoutesEnum.Main));
  }

  ionViewWillLeave() {
    this._sub?.unsubscribe();
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
