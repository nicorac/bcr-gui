import { ScrollingModule } from '@angular/cdk/scrolling';
import { CommonModule, DatePipe } from '@angular/common';
import { APP_INITIALIZER, NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy, RouterModule } from '@angular/router';
import { IonicModule, IonicRouteStrategy, Platform } from '@ionic/angular';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { AudioPlayerComponent } from './components/audio-player/audio-player.component';
import { CallIconComponent } from './components/call-icon/call-icon.component';
import { HeaderComponent } from './components/header/header.component';
import { VirtualScrollbarComponent } from './components/virtual-scrollbar/virtual-scrollbar.component';
import { IonicI18nDirective } from './directives/ionic-i18n.directive';
import { LongPressDirective } from './directives/long-press.directive';
import { AboutPage } from './pages/about/about.page';
import { MainPage } from './pages/main/main.page';
import { FilenamePatternEditorComponent } from './pages/settings/filename-pattern-editor/filename-pattern-editor.component';
import { SettingsPage } from './pages/settings/settings.page';
import { DatetimePipe } from './pipes/datetime.pipe';
import { FilesizePipe } from './pipes/filesize.pipe';
import { ToHmsPipe } from './pipes/to-hms.pipe';
import { TranslatePipe } from './pipes/translate.pipe';
import { ContactsService } from './services/contacts.service';
import { I18nService } from './services/i18n.service';
import { SettingsService } from './services/settings.service';
import version from './version';

@NgModule({
  declarations: [
    AboutPage,
    AppComponent,
    FilenamePatternEditorComponent,
    FilesizePipe,
    MainPage,
    SettingsPage,
    VirtualScrollbarComponent,
  ],
  imports: [
    AudioPlayerComponent,
    AppRoutingModule,
    BrowserModule,
    CallIconComponent,
    CommonModule,
    DatetimePipe,
    FormsModule,
    HeaderComponent,
    IonicI18nDirective,
    IonicModule.forRoot({ innerHTMLTemplatesEnabled: true }),
    LongPressDirective,
    RouterModule,
    ScrollingModule,
    ToHmsPipe,
    TranslatePipe,
  ],
  providers: [
    ContactsService,
    DatePipe,
    ToHmsPipe,
    { provide: APP_INITIALIZER, useFactory: appInitializer, deps: [ I18nService, SettingsService, Platform ], multi: true },
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
  ],
  bootstrap: [
    AppComponent
  ],
})
export class AppModule {}

/**
 * Load settings and set languages before app start
 */
function appInitializer(i18n: I18nService, settings: SettingsService, platform: Platform) {
  return async () => {

    // if (!environment.production) {
    //   waitForDebugger();
    // }

    // wait for Ionic initialization
    await platform.ready();

    // initialize version & settings
    await version.initialize();
    await settings.initialize();

    // initialize i18n & load culture
    await i18n.initialize();
    await i18n.load(settings.culture ? settings.culture : settings.defaultCulture);

  }
}

// /**
//  * Wait for a debugger to attach.
//  * If already attached, it will break at "debugger" line...
//  */
// async function waitForDebugger() {
//   while (true) {
//     const t = Date.now();
//     debugger; // if debugger is attached, then it will break here (and at least 10ms elapsed...)
//     if (Date.now() - t > 10) {
//       break;
//     }
//     else {
//       console.log('Waiting for debugger to attach...');
//       await new Promise(r => setTimeout(r, 1000));  // wait for 1 second
//     }
//   }
// }