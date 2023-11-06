
import { Pipe, PipeTransform } from '@angular/core';
import { SettingsService } from '../services/settings.service';

@Pipe({
  name: 'datetime'
})
export class DatetimePipe implements PipeTransform {

  constructor(
    private settings: SettingsService,
  ) {}

  transform(timestamp: Date|number, options?: Intl.DateTimeFormatOptions): string {

    if (timestamp === null || timestamp === undefined) return '';

    // merge 12/24 time setting (could be forced in Android settings...)
    options = options ?? this.settings.dateTimeStyle;
    Object.assign(options, { hour12: this.settings.is12Hours });

    // format date
    const dtf = Intl.DateTimeFormat(
      [], // current culture
      options
    );
    return dtf.format(timestamp);
  }

}
