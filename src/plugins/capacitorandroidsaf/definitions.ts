export interface AndroidSAFPlugin {

  /**
   * Open Android SAF directory picker to select a directory and give RW access
   */
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
  readFile(options: ReadFileOptions): Promise<{ content: string, encoding?: Encoding }>;

  /**
   * Test if the given file exists
   */
  fileExists(options: FileOptions): Promise<{ exists: boolean }>;

  /**
   * Get the URI for a file
   */
  getUri(options: FileOptions): Promise<{ uri: string }>;

  // /**
  //  * Create a new file
  //  *
  //  * @returns Uri of the created file
  //  */
  // createFile(options: CreateFileParameter): Promise<{ uri: string }>;

  /**
   * Write file content.
   * The file is created if not already exists.
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
  ERR_INVALID_CONTENT = "ERR_INVALID_CONTENT",
  ERR_NOT_FOUND = "ERR_NOT_FOUND",
  ERR_IO_EXCEPTION = "ERR_IO_EXCEPTION",
  ERR_UNKNOWN = "ERR_UNKNOWN",
}

/**
 * File encodings
 */
export enum Encoding {
  ASCII = 'ascii',
  UTF8 = 'utf8',
  UTF16 = 'utf16',
}

interface BaseFilesOptions {
  // URI of the base directory
  // (obtained with selectDirectory() & Intent.ACTION_OPEN_DOCUMENT_TREE)
  directory: string;
}

interface FileOptions extends BaseFilesOptions {
  // filename
  filename: string;
}

export interface ListFilesOptions extends BaseFilesOptions { }

export interface ReadFileOptions extends FileOptions {
  /**
   * File content encoding.
   * If undefined then the file is read as binary and returned as BASE64 encoded string.
   */
  encoding?: Encoding,
}

export interface WriteFileOptions extends FileOptions {
  /**
   * File content, as plain text (encoded with the given encoding) or BASE64 encoded.
   */
  content: string;
  /**
   * File content encoding.
   * If undefined then "content" is considered as BASE64 encoded string.
   */
  encoding?: Encoding,
}

export interface DeleteFileOptions extends FileOptions { }

export interface IDocumentFile extends BaseFilesOptions {
  name: string,     // file/directory name
  uri: string,      // file URI
  type: string,     // MIME type
  isDirectory: boolean,
  isVirtual: boolean,
  size: number,
  lastModified: number,
}
