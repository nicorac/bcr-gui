import { Subscription } from 'rxjs';
import { AppRoutesEnum } from 'src/app/app-routing.module';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { IonicBundleModule } from 'src/app/IonicBundle.module';
import { TranslatePipe } from 'src/app/pipes/translate.pipe';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Platform } from '@ionic/angular';
import version from '../../version';

@Component({
  selector: 'app-about',
  standalone: true,
  templateUrl: './about.page.html',
  styleUrls: ['./about.page.scss'],
  imports: [
    HeaderComponent,
    IonicBundleModule,
    TranslatePipe
  ],
})
export class AboutPage {

  private backSub?: Subscription;

  protected version = version;

  protected readonly descData = {
    appName: version.appName,
    bcrLink: version.bcrUri,
  };

  constructor(
    protected platform: Platform,
    protected router: Router,
  ) {
    // subscribe to hardware back button events
    this.backSub = this.platform.backButton.subscribeWithPriority(10, () => this.router.navigateByUrl(AppRoutesEnum.Main));
  }

  ionViewWillLeave() {
    this.backSub?.unsubscribe();
  }

}
