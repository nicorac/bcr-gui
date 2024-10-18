import { Directive, ElementRef } from '@angular/core';
import { IonSelect } from '@ionic/angular';
import { I18nService } from '../services/i18n.service';

/**
 * Directive to globally translate Ionic Select modal OK/Cancel labels.
 * NOTE: To be used together with IonicBundleModule.
 */
@Directive({
    // eslint-disable-next-line @angular-eslint/directive-selector
    selector: "ion-select",
    standalone: true,
})
export class IonicI18nDirective {

  constructor(
    i18n: I18nService,
    elem: ElementRef<IonSelect>,
  ) {
    if (!elem.nativeElement.cancelText) {
      elem.nativeElement.cancelText = i18n.get('LBL_CANCEL');
    }
    if (!elem.nativeElement.okText) {
      elem.nativeElement.okText = i18n.get('LBL_OK');
    }
  }

}