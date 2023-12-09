/**
 * Filters the given list with the given pattern string.
 * If pattern contains more than one part (separated by whitespace) then
 * al parts will be searched and "ANDed".
 *
 * @param list            list to be filtered
 * @param pattern         search string to be searched, like "term" or "term1 term2 ..."
 * @param valueGetter     function to get the value of each item; return 'undefined' to forcibly exclude the item
 */
 export function filterList<T>(list: T[], pattern: string, valueGetter: (item: T) => string) : T[] {

  // prepare filtered list
  if (typeof pattern === 'string' && pattern !== '') {

    // split search string in parts and create RegExpressions
    const filterParts = pattern.split(/\s+/).filter(i => i !== '');
    const filterRegExprs = filterParts.map(fp => new RegExp(escapeRegexPattern(fp), 'gi'));

    // filter original list
    return list.filter(item => {
      if (item === null || item === undefined) {
        return false;
      }
      // apply each RegExpr to item
      const value = valueGetter(item);
      if (value === undefined) {
        return false;
      }
      else {
        let allMatch = true;
        for (const re of filterRegExprs) {
          if (!value.match(re)) {
            allMatch = false;
            break;
          }
        }
        // if all regexps were successful, then a match occurred so return the item
        return allMatch;
      }
    });
  }
  else {
    return list;
  }
}

function escapeRegexPattern(pattern: string): string {
  return pattern.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}