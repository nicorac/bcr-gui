import { JsonProperty } from '../utils/json-serializer';
import { Recording } from './recording';

// database props
export const DB_FILENAME = '.bcr-gui-database.json';
export const DB_SCHEMA_VERSION = 2;

// database structure
export class DbContent {

  @JsonProperty({ deserialize: false })
  schemaVersion: number = DB_SCHEMA_VERSION;

  @JsonProperty({ isArray: true, type: Recording })
  data: Recording[] = [];

  @JsonProperty()
  lastUpdate: number = 0;

  constructor(data: Recording[] = [], lastUpdate = 0) {
    this.data = data;
    this.lastUpdate = lastUpdate;
  }

}