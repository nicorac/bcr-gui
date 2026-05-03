import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { App } from '@capacitor/app';
import { StatusBar } from '@capacitor/status-bar';
import { NavigationBar } from '@capgo/capacitor-navigation-bar';
import { IonRouterOutlet, Platform } from '@ionic/angular';
import { AppRoutesEnum } from './app-routing.module';
import { IonicBundleModule } from './IonicBundle.module';
import { TranslatePipe } from './pipes/translate.pipe';
import { I18nService } from './services/i18n.service';
import { MessageBoxService } from './services/message-box.service';
import { RecordingsService } from './services/recordings.service';
import { SettingsService, Theme } from './services/settings.service';
import { untilTrue } from './utils/waitForAsync';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonicBundleModule,
    RouterLink,
    TranslatePipe,
  ],
})
export class AppComponent implements OnInit {

  protected AppRoutesEnum = AppRoutesEnum;

  // services
  private i18n = inject(I18nService);
  private mbs = inject(MessageBoxService);
  private platform = inject(Platform);
  private recordingsService = inject(RecordingsService);
  private router = inject(Router);
  private settings = inject(SettingsService);
  private routerOutlet? = inject(IonRouterOutlet, { optional: true });

  constructor() {

    // customize Back button management
    this.platform.backButton.subscribeWithPriority(-1, () => {
      if (!this.routerOutlet?.canGoBack()) {
        App.exitApp();
      }
    });

    // attach to Android received intent handler
    App.addListener('appUrlOpen', (data: any) => this.viewIntentHandler(data));

  }

  ngOnInit() {
    // attach to darkMode status changes
    this.settings.themeMode.subscribe(theme => this.updateDarkMode(theme));
  }

  /**
   * Handles the received Android VIEW intent
   */
  private async viewIntentHandler(data: any) {

    // Check if the URL is a content:// URI
    // (AndroidManifest.xml already filtered for BCR content only)
    if (!data?.url?.startsWith('content://')) {
      return;
    }

    // url is something like this:
    // content://com.chiller3.bcr.provider?orig=content%3A%2F%2Fcom.android.externalstorage.documents%2Ftree%2FABCD-EFGH%253ABCR%2Fdocument%2FABCD-EFGH%253ABCR%252F20240930_120000.5%252B0200_out_%252B390123456789_CallerName.m4a
    console.log('VIEW intent received: ' + data.url);

    // parse received url
    const url = new URL(data.url);

    // extract "orig" query parameter
    const viewIntentFilename = url.searchParams.get('orig');
    if (!viewIntentFilename) {
      this.mbs.showError({
        header: 'ERR_INVALID_INTENT_URL',
        message: this.i18n.get('ERR_INVALID_INTENT_URL_MESSAGE', data.url),
      });
      return;
    }

    // go to main page
    await this.router.navigateByUrl(AppRoutesEnum.Main, {
      onSameUrlNavigation: 'reload',
    });
    await untilTrue(() => !!this.recordingsService.mainPageRef, 250, 15000);
    await this.recordingsService.mainPageRef?.playIntentFile(viewIntentFilename);

  }

  /**
   * Add or remove the "dark" class on the document body
   */
  private updateDarkMode(theme: Theme) {

    // update body style
    document.body.classList.toggle('dark', theme === 'dark');

    // set new navbar color
    const navigationColor = this.getBodyCssValue('--player-background-color');
    NavigationBar.setNavigationBarColor({ color: navigationColor });

    // set new statusbar color
    const statusbarColor = this.getBodyCssValue('--ion-toolbar-background');
    StatusBar.setBackgroundColor({ color: statusbarColor });

  }

  /**
   * Read the value of a body CSS variable
   */
  private getBodyCssValue(variableName: string) {
    const style = getComputedStyle(document.body);
    return style?.getPropertyValue(variableName) ?? '';
  }

}