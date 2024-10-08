import { Component, OnInit, Optional } from '@angular/core';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import { StatusBar } from '@capacitor/status-bar';
import { NavigationBar } from '@capgo/capacitor-navigation-bar';
import { IonRouterOutlet, Platform } from '@ionic/angular';
import { AppRoutesEnum } from './app-routing.module';
import { I18nService } from './services/i18n.service';
import { MessageBoxService } from './services/message-box.service';
import { RecordingsService } from './services/recordings.service';
import { SettingsService, Theme } from './services/settings.service';
import { asyncWaitForCondition } from './utils/waitForAsync';

const TOOLBAR_BACKGROUND_LIGHT = '#43a047';
const TOOLBAR_BACKGROUND_DARK = '#1f241d';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent implements OnInit {

  AppRoutesEnum = AppRoutesEnum;

  constructor(
    private i18n: I18nService,
    private mbs: MessageBoxService,
    private platform: Platform,
    private recordingsService: RecordingsService,
    private router: Router,
    private settings: SettingsService,
    @Optional() private routerOutlet?: IonRouterOutlet
  ) {

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

    // Check if the URL is a file or content URI
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
    this.router.navigateByUrl(AppRoutesEnum.Main, {
      onSameUrlNavigation: 'reload',
    });
    asyncWaitForCondition(
      () => !!this.recordingsService.mainPageRef,
      () => this.recordingsService.mainPageRef?.playIntentFile(viewIntentFilename, true),
      10000,  // wait for max 10s
      500,    // test condition each 500ms
    );

  }

  /**
   * Add or remove the "dark" class on the document body
   */
  private updateDarkMode(theme: Theme) {
    const androidColor = { color: theme === 'dark' ? TOOLBAR_BACKGROUND_DARK : TOOLBAR_BACKGROUND_LIGHT };
    document.body.classList.toggle('dark', theme === 'dark');
    StatusBar.setBackgroundColor(androidColor);
    NavigationBar.setNavigationBarColor(androidColor);
  }
}