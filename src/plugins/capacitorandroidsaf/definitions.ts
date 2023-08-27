export interface AndroidSAFPlugin {

  selectDirectory(options?: { initialUri?: string }): Promise<{ selectedUri: string }>;

  /**
   * Return an IDocumentFile[] describing the files contained in the directory with the given URI.
   *
   * @param options ListFilesOptions
   */
  listFiles(options: ListFilesOptions): Promise<{ items: IDocumentFile[] }>;

  /**
   * Read file and return its content
   *
   * @param options ReadFileOptions
   */
  readFile(options: ReadFileOptions): Promise<{ content: string }>;

  /**
   * Delete a file
   *
   * @param options DeleteFileOptions
   * @returns boolean true on success
   */
  deleteFile(options: DeleteFileOptions): Promise<void>;

}

/**
 * Error codes returned on failures
 */
export enum SAFErrorCode {
  ERR_CANCELED = "ERR_CANCELED",
  ERR_INVALID_URI = "ERR_INVALID_URI",
  ERR_NOT_FOUND = "ERR_NOT_FOUND",
  ERR_IO_EXCEPTION = "ERR_IO_EXCEPTION",
}

interface BaseFilesOptions {
  // Item Uri
  uri: string;
}

export interface ListFilesOptions extends BaseFilesOptions { }

export interface ReadFileOptions extends BaseFilesOptions { }

export interface DeleteFileOptions extends BaseFilesOptions { }

export interface IDocumentFile extends BaseFilesOptions {
  name: string,     // file/directory name
  uri: string,      // file URI
  type: string,     // MIME type
  isDirectory: boolean,
  isVirtual: boolean,
  size: number,
  lastModified: number,
}