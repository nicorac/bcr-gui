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

}

interface BaseFilesOptions {
  // Item Uri
  uri: string;
}

export interface ListFilesOptions extends BaseFilesOptions { }

export interface ReadFileOptions extends BaseFilesOptions { }

export interface IDocumentFile extends BaseFilesOptions {
  name: string,     // file/directory name
  type: string,     // MIME type
  isDirectory: boolean,
  isFile: boolean,
  isVirtual: boolean,
  size: number,
  lastModified: string|number,
}