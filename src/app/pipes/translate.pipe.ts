import { inject, Pipe, PipeTransform } from '@angular/core';
import { I18nKey, I18nService, TranslationArgs } from '../services/i18n.service';

@Pipe({
  name: 'translatePipe',
})
export class TranslatePipe implements PipeTransform {

  private langService = inject(I18nService);

  transform(key: I18nKey, values?: TranslationArgs): string {
    return this.langService.get(key, values);
  }

}
