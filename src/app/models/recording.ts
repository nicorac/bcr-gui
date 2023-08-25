import { AndroidSAF, Encodings, IDocumentFile } from 'src/plugins/capacitorandroidsaf';
import { stripExtension } from '../utils/filesystem';
import { BcrRecordingMetadata } from './BcrRecordingMetadata';

/**
 * Class describing a BCR recording
 */
export class Recording {

  // original reference to underlying Android DocumentFile + optional JSON metadata
  file!: IDocumentFile;
  metadataFile?: IDocumentFile;

  // recording has associated json metadata file
  hasMetadata = false;

  /**
   * "other party" of the call
   * - incoming calls: caller name (if known) and its number
   * - outgoing calls: callee name (if known) and its number
   *
   * opName is filled with contact name or its number (if no name can be retrieved)
   */
  opName: string = '';
  opNumber: string = '';

  // Call direction
  direction!: 'in' | 'out' | 'conference' | '';

  // Recording date (JS timestamp)
  date: number = 0;

  // Recording duration (in seconds)
  duration: number = 0;

  // SIM used for the call
  simSlot: number = 0;

  // Recording file size (in bytes)
  filesize: number = 0;

  // Audio file MIME type
  mimeType: string = '';

  // record status
  status?: 'new' | 'unchanged' | 'deleted' = 'new';

  /**
   * Use createInstance()...
   */
  private constructor() {}

  /**
   * Create a new Recording instance from the given audio file and optional metadata file
   */
  static async createInstance(file: IDocumentFile, metadataFile?: IDocumentFile) {

    const res = new Recording();

    // save files references
    res.file = file;
    res.metadataFile = metadataFile;

    // save Android file props
    res.filesize = file.size;
    res.mimeType = file.type;
    res.date = file.lastModified;
    res.opName = file.name;
    res.opNumber = file.name;

    // if JSON metadata props are not available, try to extract them from filename
    let metadata: Partial<BcrRecordingMetadata> = {};
    if (metadataFile) {
      const { content: metadataFileContent } = await AndroidSAF.readFile({ uri: metadataFile.uri, encoding: Encodings.UTF8 });
      try {
        metadata = JSON.parse(metadataFileContent);
        res.hasMetadata = true;
      }
      catch (error) {
        res.hasMetadata = false;
        console.error(error);
      }
    }
    else {
      metadata = Recording.extractMetadataFromFilename(file.name);
    }

    // parse other fields from real (or "filename extracted") metadata
    res.direction = metadata.direction ?? '';
    res.simSlot = metadata.sim_slot ?? 0;
    res.duration = Math.ceil(metadata.output?.recording?.duration_secs_total ?? 0);
    if (metadata.timestamp_unix_ms) {
      res.date = metadata.timestamp_unix_ms;
    }

    // extract "other party" data
    const calls0 = metadata.calls?.[0];
    if (calls0) {
      res.opNumber = calls0.phone_number_formatted ?? '<unknown>';
      res.opName = calls0.contact_name ?? res.opNumber;
    }

    return res;
  }

  /**
   * Try to extract metadata by parsing the recording filename.
   *
   * @returns Partial instance of BcrRecordingMetadata with the extracted info.
   */
  private static extractMetadataFromFilename(filename: string): Partial<BcrRecordingMetadata> {

    const res: Partial<BcrRecordingMetadata> = {};

    // split filename into parts
    //     |   0    |        1      | 2|      3     |      4    |
    // --> '20230522_164658.997+0200_in_+39012345678_caller name.m4a'
    const parts = stripExtension(filename).split('_');

    // ensure we have at least 5 parts
    while (parts.length < 5) {
      parts.push('');
    }

    // extract recording date
    try {
      // format a JS date string "2023-12-31T23:59:59+02:00"
      //const dateString =
      const year = parts[0].substring(0, 4);
      const month = parts[0].substring(4, 6)     // month
      const day = parts[0].substring(6, 8)     // day
      const hours = parts[1].substring(0, 2)     // hours
      const minutes = parts[1].substring(2, 4)     // minutes
      const secondsAndMs = parts[1].substring(4, 10)    // seconds
      const tzHours = parts[1].substring(10, 13)    // TZ sign + hours
      const tzMinutes = parts[1].substring(13, 15)    // TZ minutes
      res.timestamp_unix_ms
        = new Date(`${year}-${month}-${day}T${hours}:${minutes}:${secondsAndMs}${tzHours}:${tzMinutes}`).valueOf();
    } catch (error) {
      res.timestamp_unix_ms = 0;
      console.error(error);
    }

    // other fields
    res.direction = <any>parts[2];
    res.calls = [
      {
        phone_number: parts[3],
        phone_number_formatted: parts[3],
        caller_name: parts[4] ? parts[4] : parts[3],
        contact_name: parts[4] ? parts[4] : parts[3],
      }
    ];

    return res;
  }

}
