import { Pipe, PipeTransform } from '@angular/core';
import { Recording } from '../models/Recording';

export enum SortMode {
  Date_ASC = 10,      // call date
  Date_DESC = 11,     // call date (descending)
  Duration_ASC = 20,  // call duration
  Duration_DESC = 21, // call duration (descending)
}

@Pipe({
  name: 'recordingsSort'
})
export class RecordingsSortPipe implements PipeTransform {

  /**
   * Returns a sorted copy of the given array
   */
  transform(list: Recording[] | null, sortMode: SortMode = SortMode.Date_DESC): Recording[] {
    // sort a copy of the original array
    return list
    ? [...list].sort(RecordingsSortPipe.getSortFunction(sortMode))
    : [];
  }

  /**
   * Return the sort function to be used
   */
  private static getSortFunction(sortMode: SortMode): (a: Recording, b: Recording) => number {

    switch (sortMode) {
      // date
      case SortMode.Date_ASC: return (a: Recording, b: Recording) => (a.date.getTime() - b.date.getTime());

      // duration
      case SortMode.Duration_ASC: return (a: Recording, b: Recording) => (a.duration - b.duration);
      case SortMode.Duration_DESC: return (a: Recording, b: Recording) => (b.duration - a.duration);

      // Date_DESC is the default mode
      default: return (a: Recording, b: Recording) => (b.date.getTime() - a.date.getTime());
    }
  }

}
