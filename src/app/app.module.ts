import { IntlModule } from 'angular-ecmascript-intl';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { CommonModule, DatePipe } from '@angular/common';
import { APP_INITIALIZER, NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy, RouterModule } from '@angular/router';
import { NativeAudio } from '@capacitor-community/native-audio';
import { IonicModule, IonicRouteStrategy, Platform } from '@ionic/angular';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { AudioPlayerComponent } from './components/audio-player/audio-player.component';
import { CallIconComponent } from './components/call-icon/call-icon.component';
import { HeaderComponent } from './components/header/header.component';
import { VirtualScrollbarComponent } from './components/virtual-scrollbar/virtual-scrollbar.component';
import { LongPressDirective } from './directives/long-press.directive';
import { AboutPage } from './pages/about/about.page';
import { MainPage } from './pages/main/main.page';
import { SettingsPage } from './pages/settings/settings.page';
import { FilesizePipe } from './pipes/filesize.pipe';
import { ToHmsPipe } from './pipes/to-hms.pipe';
import { RecordingsService } from './services/recordings.service';
import { SettingsService } from './services/settings.service';
import version from './version';

@NgModule({
  declarations: [
    AboutPage,
    AppComponent,
    AudioPlayerComponent,
    FilesizePipe,
    HeaderComponent,
    MainPage,
    SettingsPage,
    ToHmsPipe,
    VirtualScrollbarComponent,
  ],
  imports: [
    AppRoutingModule,
    BrowserModule,
    CallIconComponent,
    CommonModule,
    FormsModule,
    IntlModule,
    IonicModule.forRoot({ innerHTMLTemplatesEnabled: true }),
    LongPressDirective,
    RouterModule,
    ScrollingModule,
  ],
  providers: [
    DatePipe,
    ToHmsPipe,
    { provide: APP_INITIALIZER, useFactory: appInitializer, deps: [ RecordingsService, SettingsService, Platform ], multi: true },
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
function appInitializer(recordingsService: RecordingsService, settings: SettingsService, platform: Platform) {
  return async () => {

    // enable mixing on audio (to allow other running audio players)
    await NativeAudio.configure({ focus: false });

    // wait for Ionic initialization
    await platform.ready();

    // initialize version & settings
    await version.initialize();
    await settings.initialize();

    // // initialize recordings service
    // await recordingsService.initialize();

  }
}

