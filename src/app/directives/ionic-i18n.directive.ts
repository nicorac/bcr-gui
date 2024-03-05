import { Directive, HostBinding } from '@angular/core';
import { I18nService } from '../services/i18n.service';

@Directive({
    // eslint-disable-next-line @angular-eslint/directive-selector
    selector: "ion-select",
    standalone: true,
})
export class IonicI18nDirective {

  @HostBinding('attr.cancel-text') protected cancelText = this.i18n.get('LBL_CANCEL');

  @HostBinding('attr.ok-text') protected okText = this.i18n.get('LBL_OK');
  constructor(
    private i18n: I18nService,
  ) { }

}