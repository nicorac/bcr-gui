import { Component, Optional } from '@angular/core';
import { App } from '@capacitor/app';
import { StatusBar } from '@capacitor/status-bar';
import { IonRouterOutlet, Platform } from '@ionic/angular';
import { AppRoutesEnum } from './app-routing.module';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent {

  AppRoutesEnum = AppRoutesEnum;

  constructor(
    private platform: Platform,
    @Optional() private routerOutlet?: IonRouterOutlet
  ) {
    this.platform.backButton.subscribeWithPriority(-1, () => {
      if (!this.routerOutlet?.canGoBack()) {
        App.exitApp();
      }
    });

    this.platform.ready().then(() => {
      StatusBar.setBackgroundColor({ color: '#43a047' });
    });
  }

}