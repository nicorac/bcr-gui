/**
 * Remove extension from the given filename
 */
export function stripExtension(filename: string): string {
  const index = filename.lastIndexOf('.');
  return index >= 0 ? filename.substring(0, index) : filename;
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