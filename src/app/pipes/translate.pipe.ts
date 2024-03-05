import { Pipe, PipeTransform } from '@angular/core';
import { I18nKey, I18nService, TranslationArgs } from '../services/i18n.service';

@Pipe({
  name: 'translatePipe',
  standalone: true,
})
export class TranslatePipe implements PipeTransform {

  constructor(
    private langService: I18nService,
  ) { }

  transform(key: I18nKey, values?: TranslationArgs): string {
    return this.langService.get(key, values);
  }

}
