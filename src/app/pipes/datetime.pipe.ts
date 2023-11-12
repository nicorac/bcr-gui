
import { Pipe, PipeTransform } from '@angular/core';
import { AppDateTimeFormat, DEFAULT_DATE_FORMAT, SettingsService } from '../services/settings.service';

@Pipe({
  name: 'datetime',
  standalone: true,
})
export class DatetimePipe implements PipeTransform {

  constructor(
    private settings: SettingsService,
  ) {}

  transform(timestamp: Date|number, options?: AppDateTimeFormat): string {

    if (timestamp === null || timestamp === undefined) return '';

    // merge 12/24 time setting (could be forced in Android settings...)
    options = options ?? this.settings.dateTimeFormat;
    Object.assign(options, { hour12: this.settings.is12Hours });

    // manage 'custom' format
    if (options.customFormat) {
      return DatetimePipe.toCustomFormat(timestamp, options.customFormat);
    }
    else {
      // format date
      const dtf = Intl.DateTimeFormat(
        [], // current culture
        options as Intl.DateTimeFormatOptions
      );
      return dtf.format(timestamp);
    }
  }

  /**
   * Format the given date using a custom format string:
   *
   * YY	  01	Two-digit year
   * YYYY	2001	Four-digit year
   * M	  1-12	Month, beginning at 1
   * MM	  01-12	Month, 2-digits
   * MMM	Jan-Dec	The abbreviated month name
   * MMMM	January-December	The full month name
   * D	  1-31	Day of month
   * DD	  01-31	Day of month, 2-digits
   * H	  0-23	Hours
   * HH	  00-23	Hours, 2-digits
   * h	  1-12	Hours, 12-hour clock
   * hh	  01-12	Hours, 12-hour clock, 2-digits
   * m	  0-59	Minutes
   * mm	  00-59	Minutes, 2-digits
   * s	  0-59	Seconds
   * ss	  00-59	Seconds, 2-digits
   * Z	  -05:00	Offset from UTC
   * ZZ	  -0500	Compact offset from UTC, 2-digits
   * A	  AM PM	Post or ante meridiem, upper-case
   * a	  am pm	Post or ante meridiem, lower-case
   */
  private static toCustomFormat(timestamp: Date|number, format: string = DEFAULT_DATE_FORMAT): string {

    const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;

    return format.replaceAll(/(?<!\\)([YMDHhms])\1{0,3}/gm, (match: string) => {

      switch (match) {
        // year
        case 'YYYY': return date.getFullYear().toString();
        case 'YY': return date.getFullYear().toString().substring(2, 4);
        // month
        case 'MMMM': return Intl.DateTimeFormat([], {month: 'long'}).format(date);
        case 'MMM': return Intl.DateTimeFormat([], {month: 'short'}).format(date);
        case 'MM': return (date.getMonth()+1).toString().padStart(2, '0');
        case 'M': return (date.getMonth()+1).toString();
        // day
        case 'DDDD': return Intl.DateTimeFormat([], {weekday: 'long'}).format(date);
        case 'DDD': return Intl.DateTimeFormat([], {weekday: 'short'}).format(date);
        case 'DD': return date.getDate().toString().padStart(2, '0');
        case 'D': return date.getDate().toString();
        // hour
        case 'HH': return date.getHours().toString().padStart(2, '0');
        case 'H': return date.getHours().toString();
        case 'hh': {
          const h = (date.getHours() % 12);
          return h ? h.toString().padStart(2, '0') : '12';
        }
        case 'h': {
          const h = (date.getHours() % 12);
          return h ? h.toString() : '12';
        }
        // minute
        case 'mm': return date.getMinutes().toString().padStart(2, '0');
        case 'm': return date.getMinutes().toString();
        // second
        case 'ss': return date.getSeconds().toString().padStart(2, '0');
        case 's': return date.getSeconds().toString();
        // AM/PM
        case 'A': return date.getHours() >= 12 ? 'PM' : 'AM';
        case 'a': return date.getHours() >= 12 ? 'pm' : 'am';

        // default
        default: return match;
      }

    })
    // output all escaped chars as unchanged
    .replaceAll('\\', '');
  }

}
