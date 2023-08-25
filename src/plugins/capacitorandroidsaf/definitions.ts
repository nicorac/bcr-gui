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
  readFile(options: ReadFileOptions): Promise<{ content: string, encoding?: Encodings }>;

  /**
   * Write file content
   *
   * @param options WriteFileOptions
   */
  writeFile(options: WriteFileOptions): Promise<void>;

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
export enum ErrorCode {
  ERR_CANCELED = "ERR_CANCELED",
  ERR_INVALID_URI = "ERR_INVALID_URI",
  ERR_NOT_FOUND = "ERR_NOT_FOUND",
  ERR_IO_EXCEPTION = "ERR_IO_EXCEPTION",
}

/**
 * File encodings
 */
export enum Encodings {
  ASCII = 'ascii',
  UTF8 = 'utf8',
  UTF16 = 'utf16',
}

interface BaseFilesOptions {
  // Item Uri
  uri: string;
}

export interface ListFilesOptions extends BaseFilesOptions { }

export interface ReadFileOptions extends BaseFilesOptions {
  /**
   * File content encoding.
   * If undefined then the file is read as binary and returned as BASE64 encoded string.
   */
  encoding?: Encodings | undefined,
}

export interface WriteFileOptions extends BaseFilesOptions {
  /**
   * File content, as plain text (encoded with the given encoding) or BASE64 encoded.
   */
  content: string;
  /**
   * File content encoding.
   * If undefined then "content" is considered as BASE64 encoded string.
   */
  encoding?: Encodings | undefined,
}

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