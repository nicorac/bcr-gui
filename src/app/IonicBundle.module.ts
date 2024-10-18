import { NgModule } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { IonicI18nDirective } from './directives/ionic-i18n.directive';

const modules = [
  IonicModule,
  IonicI18nDirective,
];

/**
 * This module imports both
 * - IonicModule
 * - IonicI18nDirective
 */
@NgModule({
  declarations: [],
  imports: modules,
  exports: modules,
})
export class IonicBundleModule { }
