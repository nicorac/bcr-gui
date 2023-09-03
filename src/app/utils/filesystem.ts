/**
 * Remove extension from the given filename
 */
export function stripExtension(filename: string): string {
  return filename.substring(0, filename.lastIndexOf('.'));
}

/**
 * Replace file extension with the given one
 */
export function replaceExtension(filename: string, newExtension: string): string {
  if (!newExtension.startsWith('.')) {
    newExtension = '.' + newExtension;
  }
  return stripExtension(filename) + newExtension;
}

/**
 * Extract filename from a fullpath
 */
export function getFilename(fullpath: string): string {
  fullpath = fullpath.replace(/%2F/gi, '/');
  const i = fullpath.lastIndexOf('/');
  return i >= 0 ? fullpath.substring(i + 1) : fullpath;
}