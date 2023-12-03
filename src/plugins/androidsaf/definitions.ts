import { AndroidSAF } from './';

export interface AndroidSAFPlugin {

  /**
   * Open Android SAF directory picker to select a directory and give RW access
   */
  selectDirectory(options?: { initialUri?: string }): Promise<{ selectedUri: string }>;

  /**
   * Open Android file picker to select a file
   */
  selectFile(options?: { initialUri?: string }): Promise<{ selectedUri: string, displayName: string }>;

  /**
   * Return a string containing the serialized version of IDocumentFile[].
   * This is due avoid inefficiency in speed and memory of returning a big array (in case of more then 2000 files).
   *
   * NOTE: call AndroidSAFUtils.listFiles() to directly get IDocumentFile[]
   *
   * @param options ListFilesOptions
   */
  listFiles(options: DirectoryOptions): Promise<{ itemsJson: string }>;

  /**
   * Returns the last modified time of the given directory
   * @param options
   */
  getLastModified(options: DirectoryOptions): Promise<{ lastModified: number }>;

  /**
   * Read file and return its content
   *
   * @param options ReadFileOptions
   */
  readFile(options: ReadFileOptions): Promise<{ content: string, encoding?: Encoding }>;

  /**
   * Search the given directory for a file with the given name (display name).
   * Returns null uri if file cannot be found.
   *
   * BEWARE: this method could be really slow because it internally calls listFiles() and filters results.
   */
  getFileUri(options: GetFileUriOptions): Promise<{ uri?: string }>;

  /**
   * Create a new file with the given content.
   *
   * @param options CreateFileOptions
   */
  createFile(options: CreateFileOptions): Promise<{ fileUri: string }>;

  /**
   * Write file content.
   * NOTE: the file must exist!
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

export class AndroidSAFUtils {
  static async listFiles(options: DirectoryOptions): Promise<IDocumentFile[]> {
    const { itemsJson } = await AndroidSAF.listFiles(options);
    return JSON.parse(itemsJson);
  }
}

/**
 * Error codes returned on failures
 */
export enum ErrorCode {
  ERR_CANCELED = "ERR_CANCELED",
  ERR_INVALID_URI = "ERR_INVALID_URI",
  ERR_INVALID_NAME = "ERR_INVALID_NAME",
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

interface FileOptions {
  // filename
  fileUri: string;
}

export interface DirectoryOptions {
  // URI of the base directory
  // (obtained with selectDirectory() & Intent.ACTION_OPEN_DOCUMENT_TREE)
  directoryUri: string;
}

export interface ReadFileOptions extends FileOptions {
  /**
   * File content encoding.
   * If undefined then the file is read as binary and returned as BASE64 encoded string.
   */
  encoding?: Encoding,
}

interface CreateWriteFileOptionsBase {
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

export interface GetFileUriOptions extends DirectoryOptions {
  /**
   * Name of the file (display name)
   */
  name: string;
}

export interface CreateFileOptions extends DirectoryOptions, CreateWriteFileOptionsBase {
  /**
   * Name of the file (display name)
   */
  name: string;
}

export interface WriteFileOptions extends FileOptions, CreateWriteFileOptionsBase { }

export interface DeleteFileOptions extends FileOptions { }

export interface IDocumentFile {
  displayName: string,  // file name (SAF display name)
  uri: string,          // file URI
  type: string,         // MIME type
  isDirectory: boolean,
  isVirtual: boolean,
  size: number,
  lastModified: number,
}
