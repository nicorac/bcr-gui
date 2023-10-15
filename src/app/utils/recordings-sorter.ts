import { Recording } from '../models/recording';

export enum SortModeEnum {
  Date_ASC = 10,      // call date
  Date_DESC = 11,     // call date (descending)
  Duration_ASC = 20,  // call duration
  Duration_DESC = 21, // call duration (descending)
}

/**
 * Returns a sorted copy of the given Recording array
 */
export function sortRecordings(list: Recording[] | null, sortMode: SortModeEnum): Recording[] {
  // sort a copy of the original array
  return list
    ? [...list].sort(getSortFunction(sortMode))
    : [];
}

/**
 * Return the sort function to be used
 */
function getSortFunction(sortMode: SortModeEnum): (a: Recording, b: Recording) => number {

  switch (sortMode) {
    // date
    case SortModeEnum.Date_ASC: return (a: Recording, b: Recording) => (a.date - b.date);

    // duration
    case SortModeEnum.Duration_ASC: return (a: Recording, b: Recording) => (a.duration - b.duration);
    case SortModeEnum.Duration_DESC: return (a: Recording, b: Recording) => (b.duration - a.duration);

    // Date_DESC is the default mode
    default: return (a: Recording, b: Recording) => (b.date - a.date);
  }
}
