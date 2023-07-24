/**
 * Remove extension from the given filename
 */
export function stripExtension(filename: string): string {
  return filename.substring(0, filename.lastIndexOf('.'));
}