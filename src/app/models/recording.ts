import { AndroidSAF, Encoding, IDocumentFile } from 'src/plugins/androidsaf';
import { replaceExtension, stripExtension } from '../utils/filesystem';
import { JsonProperty } from '../utils/json-serializer';
import { BcrRecordingMetadata, CallDirection } from './BcrRecordingMetadata';

export const FILENAME_PATTERN_SUPPORTED_VARS = [
  'date',
  'date:year',
  'date:year2',
  'date:month',**Is your feature request related to a problem? Please describe.**
A clear and concise description of what the problem is. Ex. I'm always frustrated when [...]

**Describe the solution you'd like**
A clear and concise description of what you want to happen.

**Describe alternatives you've considered**
A clear and concise description of any alternative solutions or features you've considered.

**Additional context**
Add any other context or screenshots about the feature request here.

  'date:day',
  'date:hours',
  'date:minutes',
  'date:seconds',
  'date:ampm',
  'date:tzHours',
  'date:tzMinutes',
  'direction',
  'sim_slot',
  'phone_number',
  'caller_name',
  'contact_name',
  'call_log_name',
];

// default (well-known) filename patterns
export const FILENAME_PATTERN_TEMPLATES: { name:string, pattern:string }[] = [
  { name: 'BCR (Basic Call Recorder)', pattern: '^{date}(_{direction})?(_sim{sim_slot})?_{phone_number}(_{contact_name})?' },
  { name: 'ColorOS call recorder', pattern: '^{contact_name}-{date:year2}{date:month}{date:day}{date:hours}{date:minutes}' },
  { name: 'GrapheneOS call recorder', pattern: '^CallRecord_{date:year}{date:month}{date:day}-{date:hours}{date:minutes}{date:seconds}_{phone_number}' },
  { name: 'Huawei call recorder', pattern: '^{contact_name}@{phone_number}_{date:year}{date:month}{date:day}{date:hours}{date:minutes}{date:seconds}' },
  { name: 'LineageOS call app', pattern: '^{phone_number}_{date:year2}{date:month}{date:day}_{date:hours}{date:minutes}{date:seconds}' },
]

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
      let year = groups['date_year'] ?? ('20' + groups['date_year2']);
      let month = groups['date_month'];
      let day = groups['date_day'];
      let hours = groups['date_hours'];
      let minutes = groups['date_minutes'];
      let secondsAndMs = groups['date_seconds'] ?? '00';

      // if any of the required date parts is missing, fall back to "0" date
      if (year && month && day && hours && minutes && secondsAndMs) {
        // is timezone missing? then use current...
        let tz = '';
        if (groups['date_tzHours'] !== undefined && groups['date_tzMinutes'] !== undefined) {
          tz = (groups['date_tzHours'] ?? '+00') + ':' + groups['date_tzMinutes'] ?? '00';
          // ensure TZ has a sign
          if (!(tz.startsWith('+') || tz.startsWith('-'))) {
            tz = '+' + tz;
          }
        }

        // test if time is expressed in 12h format
        let ampm = groups['date_ampm']?.toUpperCase();
        if (ampm) {
          // fix hours to 24h format
          hours = ((+hours % 12) + (ampm === "AM" ? 0 : 12)).toString().padStart(2, '0');
        }

        // format a JS date string with the extracted parts,
        // like "2023-12-31T23:59:59+02:00" (tz is optional...)
        res.timestamp_unix_ms
          = new Date(`${year}-${month}-${day}T${hours}:${minutes}:${secondsAndMs}${tz}`).valueOf();
      }
      else {
        res.timestamp_unix_ms = 0;
      }

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
    const re = /\{([\w\:]+?)\}/g;
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

  /**
   * Build and return the pattern of a RegEx to be used
   * to parse recording filename based on given pattern (or current config)
   */
  public static getFilenameRegExpPattern(pattern: string): string {

    const vars = Recording.getFilenamePatternVars(pattern);

    // transform each format var in a RegEx capture pattern
    for (const v of vars) {

      let replacement = '';

      // get var pattern
      switch (v) {
        case 'date':
          // sample BCR default date_ "20230518_171143.015+0100"
          replacement = Recording.getFilenameRegExpPattern('{date:year}{date:month}{date:day}_{date:hours}{date:minutes}{date:seconds}{date:tzHours}{date:tzMinutes}');
          break;
        case 'date:year':       replacement = String.raw`(?<date_year>\d{4})`; break;
        case 'date:year2':      replacement = String.raw`(?<date_year2>\d{2})`; break;
        case 'date:month':      replacement = String.raw`(?<date_month>\d{2})`; break;
        case 'date:day':        replacement = String.raw`(?<date_day>\d{2})`; break;
        case 'date:hours':      replacement = String.raw`(?<date_hours>\d{2})`; break;
        case 'date:minutes':    replacement = String.raw`(?<date_minutes>\d{2})`; break;
        case 'date:seconds':    replacement = String.raw`(?<date_seconds>\d{2}(\.\d{1,3})?)`; break;
        case 'date:tzHours':    replacement = String.raw`(?<date_tzHours>[\+\-]?\d{2})`; break;
        case 'date:tzMinutes':  replacement = String.raw`(?<date_tzMinutes>\d{2})`; break;
        case 'date:ampm':       replacement = String.raw`(?<date_ampm>AM|PM)`; break;

        case 'direction':
          // --> in|out|
          replacement = String.raw`(?<direction>in|out|conference)`;
          break;
        case 'phone_number':
          // --> +39123456789
          replacement = String.raw`(?<phone_number>[\d\+\- ]+|unknown)`;
          break;
        case 'sim_slot':
          // --> 0|1
          replacement = String.raw`(?<sim_slot>\d+)`;
          break;
        case 'caller_name':
        case 'contact_name':
        case 'call_log_name':
          replacement = String.raw`(?<caller_name>.*)`;
          break;
        default:
          console.warn('Unsupported var:', v);
      }

      pattern = pattern.replace(`{${v}}`, replacement);
    }

    return pattern;

  }

  /**
   * Build and return a RegEx to be used
   * to parse recording filename based on given pattern (or current config)
   */
  public static getFilenameRegExp(pattern: string): RegExp {
    // NOTE: NO "g" option here, because we need to reuse this RegExp multiple times!
    return new RegExp(Recording.getFilenameRegExpPattern(pattern), 'i');
  }

}
