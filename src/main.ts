import { provideHttpClient } from '@angular/common/http';
import { enableProdMode, ErrorHandler, inject, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, RouteReuseStrategy } from '@angular/router';
import { IonicRouteStrategy, Platform, provideIonicAngular } from '@ionic/angular';
import { routes } from './app/app-routing.module';
import { AppComponent } from './app/app.component';
import { I18nService } from './app/services/i18n.service';
import { SettingsService } from './app/services/settings.service';
import { CustomErrorHandler } from './app/utils/errorHandler';
import version from './app/version';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, {
  providers: [
    provideAppInitializer(initializeApp),
    provideIonicAngular({ innerHTMLTemplatesEnabled: true }),
    provideZoneChangeDetection(),
    provideHttpClient(),
    provideRouter(routes),
    {
      provide: ErrorHandler,
      useClass: CustomErrorHandler,
    },
    {
      provide: RouteReuseStrategy,
      useClass: IonicRouteStrategy,
    },
  ],
}).catch((err) => console.error(err));

/**
 * App initializer
 */
async function initializeApp() {

  const i18n = inject(I18nService);
  const settings = inject(SettingsService);
  const platform = inject(Platform);

  // if (!environment.production) {
  //   waitForDebugger();
  // }

  // wait for Ionic initialization
  await platform.ready();

  // initialize version & settings
  await version.initialize();
  await settings.initialize();

  // initialize i18n & load culture
  await i18n.initialize(settings);
  await i18n.load(settings.culture);

  // intercept unmanaged errors
  window.onerror = function (message, file, line, col, error) {
    alert('Error occurred: ' + error?.message);
    return false;
  };
  window.addEventListener('unhandledrejection', function (e) {
    alert('Error occurred: ' + e.reason.message);
  });

}
