import { Pipe, PipeTransform } from '@angular/core';
import { Recording } from '../models/recording';
import { TagReference } from '../models/tags';

export enum SortMode {
  Date_ASC = 10,      // call date
  Date_DESC = 11,     // call date (descending)
  Duration_ASC = 20,  // call duration
  Duration_DESC = 21, // call duration (descending)
}

export class Filter {
  search: string = '';
  tags: TagReference[] = [];
}

@Pipe({
  name: 'recordingsSortFilter'
})
export class RecordingsSortFilterPipe implements PipeTransform {

  /**
   * Returns a sorted copy of the given array
   */
  transform(list: Recording[]|null, sortMode: SortMode = SortMode.Date_DESC, filter: Filter): Recording[] {

    // work on a copy of the original array (because of the final sort)
    if (filter.search) {
      const searchString = filter.search.toLowerCase();
      list = list?.filter(r => r.opName.toLowerCase().includes(searchString)) ?? []
    }
    else {
      list = list ? [...list] : [];
    }

    // sort the final list
    list.sort(RecordingsSortFilterPipe.getSortFunction(sortMode));

    // return
    return list;
  }

  /**
   * Return the sort function to be used
   */
  private static getSortFunction(sortMode: SortMode): (a: Recording, b: Recording) => number {

    switch (sortMode) {
      // date
      case SortMode.Date_ASC: return (a: Recording, b: Recording) => (a.date - b.date);

      // duration
      case SortMode.Duration_ASC: return (a: Recording, b: Recording) => (a.duration - b.duration);
      case SortMode.Duration_DESC: return (a: Recording, b: Recording) => (b.duration - a.duration);

      // Date_DESC is the default mode
      default: return (a: Recording, b: Recording) => (b.date - a.date);
    }
  }

}
