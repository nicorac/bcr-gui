import { Directory, Encoding, Filesystem, WriteFileResult } from '@capacitor/filesystem';
import { Recording } from '../models/recording';

// filename of the cache
const DB_CACHE_FILENAME = 'db-cache.json';

// version of cache schema
// NOTE: must be changed each time we need to "invalidate" old cache content (eg: a new Recording field must be filled in)
const CACHE_SCHEMA_VERSION = 3;

/**
 * Defines content of cache file
 */
type CacheContent = {
  cacheSchemaVersion: number,
  recordings: Recording[],
}

/**
 * Application cache for the recordings database
 */
export class RecordingsCache {

  // no constructor needed, only static methods...
  private constructor() {}

  /**
   * Load the cache from app storage
   */
  static async load(): Promise<Recording[]> {

    // recover recordings DB from cache
    if (await RecordingsCache.checkFileExists(DB_CACHE_FILENAME)) {

      // read file content
      const { data: cacheContent } = await Filesystem.readFile({ path: DB_CACHE_FILENAME, directory: Directory.Cache, encoding: Encoding.UTF8 });
      let cacheData: Partial<CacheContent>;
      try {
        cacheData = JSON.parse(cacheContent as string) as Partial<CacheContent>;
      } catch (error) {
        cacheData = {};
      }

      // check schema version
      if (cacheData.cacheSchemaVersion === CACHE_SCHEMA_VERSION) {
        // return cache content
        return cacheData.recordings ?? [];
      }
    }

    // empty cache
    return [];

  }

  /**
   * Save cache to app storage
   */
  static save(recordings: Recording[]): Promise<WriteFileResult> {

    const cacheContent: string = JSON.stringify(<CacheContent>{
      cacheSchemaVersion: CACHE_SCHEMA_VERSION,
      recordings: recordings,
    });

    return Filesystem.writeFile({
      path: DB_CACHE_FILENAME,
      directory: Directory.Cache,
      data: cacheContent,
      encoding: Encoding.UTF8,
    });

  }

  /**
   * Clear the cache
   */
  static clear(): Promise<WriteFileResult> {
    return this.save([]);
  }

  /**
   * Test if the given file exists
   */
  private static async checkFileExists(filePath: string): Promise<boolean> {
    try {
      await Filesystem.stat({ path: filePath, directory: Directory.Cache });
      return true;
    } catch (checkDirException) {
      return false;
    }
  }

}