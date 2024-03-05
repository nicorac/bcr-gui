import { Subscription } from 'rxjs';
import { AppRoutesEnum } from 'src/app/app-routing.module';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Platform } from '@ionic/angular';
import version from '../../version';

@Component({
  selector: 'app-about',
  templateUrl: './about.page.html',
  styleUrls: ['./about.page.scss'],
})
export class AboutPage {

  version = version;
  private backSub?: Subscription;
  protected readonly descData = {
    appName: version.appName,
    bcrLink: `<a href="https://github.com/chenxiaolong/BCR">BCR</a>`,
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
