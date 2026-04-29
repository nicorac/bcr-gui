import { provideHttpClient } from '@angular/common/http';
import { enableProdMode, ErrorHandler, importProvidersFrom, inject, provideAppInitializer } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, RouteReuseStrategy } from '@angular/router';
import { IonicModule, IonicRouteStrategy, Platform } from '@ionic/angular';
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
    // provideZoneChangeDetection(),   // to be removed...
    provideHttpClient(),
    provideRouter(routes),
    importProvidersFrom(
      IonicModule.forRoot({ innerHTMLTemplatesEnabled: true })
    ),
    {
      provide: ErrorHandler,
      useClass: CustomErrorHandler,
    },
    {
      provide: RouteReuseStrategy,
      useClass: IonicRouteStrategy,
    },
    provideAppInitializer(() => initializeApp(
      inject(I18nService),
      inject(SettingsService),
      inject(Platform),
    )),
  ],
}).catch((err) => console.error(err));

/**
 * App initializer
 */
async function initializeApp(
  i18n: I18nService,
  settings: SettingsService,
  platform: Platform
) {
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
