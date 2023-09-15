import { Component, OnInit, Optional } from '@angular/core';
import { App } from '@capacitor/app';
import { StatusBar } from '@capacitor/status-bar';
import { NavigationBar } from '@capgo/capacitor-navigation-bar';
import { IonRouterOutlet, Platform } from '@ionic/angular';
import { AppRoutesEnum } from './app-routing.module';
import { SettingsService, Theme } from './services/settings.service';

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
    private platform: Platform,
    private settings: SettingsService,
    @Optional() private routerOutlet?: IonRouterOutlet
  ) {

    // customize Back button management
    this.platform.backButton.subscribeWithPriority(-1, () => {
      if (!this.routerOutlet?.canGoBack()) {
        App.exitApp();
      }
    });

  }

  ngOnInit() {
    // attach to darkMode status changes
    this.settings.themeMode.subscribe(theme => this.updateDarkMode(theme));
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