import { Directive, ElementRef, inject } from '@angular/core';
import { IonSelect } from '@ionic/angular';
import { I18nService } from '../services/i18n.service';

/**
 * Directive to globally translate Ionic Select modal OK/Cancel labels.
 */
@Directive({
  // eslint-disable-next-line @angular-eslint/directive-selector
  selector: "ion-select",
})
export class IonicI18nDirective {

  private i18n = inject(I18nService);
  private elem = inject(ElementRef<IonSelect>);


  constructor() {
    if (!this.elem.nativeElement.cancelText) {
      this.elem.nativeElement.cancelText = this.i18n.get('LBL_CANCEL');
    }
    if (!this.elem.nativeElement.okText) {
      this.elem.nativeElement.okText = this.i18n.get('LBL_OK');
    }
  }

}