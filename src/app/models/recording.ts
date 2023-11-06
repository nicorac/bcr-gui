import { AndroidSAF, Encoding, IDocumentFile } from 'src/plugins/androidsaf';
import { replaceExtension, stripExtension } from '../utils/filesystem';
import { JsonProperty } from '../utils/json-serializer';
import { BcrRecordingMetadata, CallDirection } from './BcrRecordingMetadata';

export const FILENAME_PATTERN_SUPPORTED_VARS = [
  'date',
  'direction',
  'sim_slot',
  'phone_number',
  'caller_name',
  'contact_name',
  'call_log_name',
];
export const FILENAME_PATTERN_DEFAULT = '^{date}(_{direction})?(_sim{sim_slot})?_{phone_number}(_{contact_name})?';

/**
 * Class describing a BCR recording
 */
export class Recording {

  // references to audio/metadata file
  @JsonProperty() audioUri!: string;
  @JsonProperty() audioDisplayName!: string;
  @JsonProperty() metadataUri?: string; // must keep this in case of Delete() calls...

  // test if this recording has an associated metadata file
  get hasMetadata() { return this.metadataUri !== undefined };

  /**
   * "other party" of the call
   * - incoming calls: caller name (if known) and its number
   * - outgoing calls: callee name (if known) and its number
   *
   * opName is filled with contact name or its number (if no name can be retrieved)
   */
  @JsonProperty() opName: string = '';
  @JsonProperty() opNumber: string = '';

  // Call direction
  @JsonProperty() direction!: CallDirection;

  // Recording date (JS timestamp)
  @JsonProperty() date: number = 0;

  // Recording duration (in seconds)
  @JsonProperty() duration: number = 0;

  // SIM used for the call
  @JsonProperty() simSlot: number = 0;

  // Recording file size (in bytes)
  @JsonProperty() filesize: number = 0;

  // Audio file MIME type
  @JsonProperty() mimeType: string = '';

  // UI only fields
  selected?: boolean = false;

  public constructor() {}

  /**
   * Create a new Recording instance from the given audio file and optional metadata file
   */
  static async createInstance(
    file: IDocumentFile,
    metadataFile: IDocumentFile|undefined,
    filenameRegExp: RegExp
  ) {

    const res = new Recording();

    // save files references
    res.audioUri = file.uri;
    res.audioDisplayName = file.displayName;
    res.metadataUri = metadataFile?.uri;

    // save Android file props
    res.filesize = file.size;
    res.mimeType = file.type;
    res.date = file.lastModified;
    res.opName = file.displayName;
    res.opNumber = file.displayName;

    // try to extract metadata from companion JSON file
    //props are not available, try to extract them from filename
    let metadata: Partial<BcrRecordingMetadata>|undefined = undefined;
    if (metadataFile) {
      metadata = await Recording.loadJSONMetadata(metadataFile);
    }
    // if JSON file is missing or a parse error occurred then fallback to parsing filename
    if (!metadata) {
      metadata = Recording.extractMetadataFromFilename(file.displayName, filenameRegExp);
    }
    res.setMetadata(metadata);

    return res;
  }

  /**
   * Set recording metadata (used by both createInstance and reparseFilename)
   * @param metadata
   */
  private setMetadata(metadata: Partial<BcrRecordingMetadata>) {

    // parse other fields from real (or "filename extracted") metadata
    this.direction = metadata.direction ?? '';
    this.simSlot = metadata.sim_slot ?? 0;
    this.duration = Math.ceil(metadata.output?.recording?.duration_secs_total ?? 0);
    if (metadata.timestamp_unix_ms) {
      this.date = metadata.timestamp_unix_ms;
    }

    // extract "other party" data
    const calls0 = metadata.calls?.[0];
    if (calls0) {
      this.opNumber = calls0.phone_number_formatted ?? calls0.phone_number ?? '<unknown>';
      this.opName = calls0.contact_name ?? this.opNumber;
    }

  }

  /**
   * Reparse recording filename
   */
  public reparseFilename(displayName: string, filenameRegExp: RegExp) {
    const metadata = Recording.extractMetadataFromFilename(displayName, filenameRegExp);
    this.setMetadata(metadata);
  }

  /**
   * Load metadata JSON file and extract its contained data
   */
  private static async loadJSONMetadata(metadataFile: IDocumentFile): Promise<Partial<BcrRecordingMetadata>|undefined> {

    const { content: metadataFileContent } = await AndroidSAF.readFile({
      fileUri: metadataFile.uri,
      encoding: Encoding.UTF8,
    });
    try {
      return JSON.parse(metadataFileContent);
    }
    catch (error) {
      console.error(error);
      return undefined;
    }

  }

  /**
   * Try to extract metadata by parsing the recording filename.
   *
   * @returns Partial instance of BcrRecordingMetadata with the extracted info.
   */
  public static extractMetadataFromFilename(filename: string, filenameRegExp: RegExp): Partial<BcrRecordingMetadata> {

    const res: Partial<BcrRecordingMetadata> = {};

    // keep only the filename
    filename = stripExtension(filename);

    // extract parts from filename
    filenameRegExp.lastIndex = 0;
    const groups = filenameRegExp.exec(filename)?.groups ?? {};

    // extract recording date
    try {
      // format a JS date string "2023-12-31T23:59:59+02:00"
      const dateString = groups['date'];
      const year = dateString.substring(0, 4);            // year
      const month = dateString.substring(4, 6)            // month
      const day = dateString.substring(6, 8)              // day
      const hours = dateString.substring(9, 11)          // hours
      const minutes = dateString.substring(11, 13)        // minutes
      const secondsAndMs = dateString.substring(13, 19)   // seconds
      const tzHours = dateString.substring(19, 22)      // TZ sign + hours
      const tzMinutes = dateString.substring(22, 24)      // TZ minutes
      res.timestamp_unix_ms
        = new Date(`${year}-${month}-${day}T${hours}:${minutes}:${secondsAndMs}${tzHours}:${tzMinutes}`).valueOf();
    } catch (error) {
      res.timestamp_unix_ms = 0;
      console.error(error);
    }

    // other fields
    res.direction = groups['direction'] as CallDirection;
    res.calls = [
      {
        phone_number: groups['phone_number'],
        phone_number_formatted: groups['phone_number'],
        caller_name: groups['caller_name'] ? groups['caller_name'] : groups['phone_number'],
        contact_name: groups['caller_name'] ? groups['caller_name'] : groups['phone_number'],
      }
    ];

    return res;
  }

  /**
   * Return the filename of the JSON metadata file associated with the given audio filename
   */
  public static getMetadataFilename(audioFilename: string): string {
    return replaceExtension(audioFilename, '.json');
  }

  /**
   * Extract variables from the given filename pattern string
   */
  public static getFilenamePatternVars(fnPattern: string): string[] {
    // extract var names (${varName})
    const re = /\{(\w+?)\}/g;
    const res = [];
    for (const m of fnPattern.matchAll(re)) {
      res.push(m[1]);
    };
    return res;
  }

  /**
   * Test the given format and return true if valid, an error message otherwise
   */
  public static validateFilenamePattern(fnPattern: string): string|true {

    const vars = this.getFilenamePatternVars(fnPattern);

    // there should be at least one variable
    if (!vars.length) {
      return 'No format variables found, please add at least one {var} to your format';
    }

    // all variables must exist
    for (const v of vars) {
      if (!FILENAME_PATTERN_SUPPORTED_VARS.includes(v)) {
        return `Unsupported variable {${v}}`;
      }
    }

    // ok
    return true;

  }

}
