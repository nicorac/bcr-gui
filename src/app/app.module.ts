import { CommonModule, DatePipe } from '@angular/common';
import { APP_INITIALIZER, LOCALE_ID, NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy, RouterModule } from '@angular/router';
import { IonicModule, IonicRouteStrategy } from '@ionic/angular';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { AudioPlayerComponent } from './components/audio-player/audio-player.component';
import { HeaderComponent } from './components/header/header.component';
import { AboutPage } from './pages/about/about.page';
import { MainPage } from './pages/main/main.page';
import { SettingsPage } from './pages/settings/settings.page';
import { FilesizePipe } from './pipes/filesize.pipe';
import { RecordingsSortPipe } from './pipes/recordings-sort.pipe';
import { ToHmsPipe } from './pipes/to-hms.pipe';
import { RecordingsService } from './services/recordings.service';
import { SettingsService } from './services/settings.service';

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
    RecordingsSortPipe,
  ],
  imports: [
    AppRoutingModule,
    BrowserModule,
    CommonModule,
    FormsModule,
    IonicModule.forRoot({ innerHTMLTemplatesEnabled: true }),
    RouterModule,
  ],
  providers: [
    DatePipe,
    ToHmsPipe,
    { provide: APP_INITIALIZER, useFactory: appInitializer, deps: [ RecordingsService, SettingsService ], multi: true },
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    { provide: LOCALE_ID, useFactory: (settings: SettingsService) => settings.deviceCulture, deps: [ SettingsService ] },
  ],
  bootstrap: [
    AppComponent
  ],
})
export class AppModule {}

/**
 * Load settings and set languages before app start
 */
function appInitializer(recordingsService: RecordingsService, settings: SettingsService) {
  return async () => {

    // initialize settings
    await settings.initialize();

    // initialize recordings service
    await recordingsService.initialize();

  }
}

