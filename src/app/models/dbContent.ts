import { JsonProperty } from '../utils/json-serializer';
import { Recording } from './recording';
import { Tags } from './tags';

// database props
export const DB_FILENAME = '.bcr-gui-database.json';
export const DB_SCHEMA_VERSION = 2;

/**
 * This class is used to (de)serialize app database (from)to JSON file
 */
export class DbContent {

  @JsonProperty()
  schemaVersion: number = DB_SCHEMA_VERSION;

  @JsonProperty({ isArray: true, type: Recording })
  data: Recording[] = [];

  @JsonProperty()
  tags: Tags = {};

  constructor(data: Recording[] = [], tags: Tags = {}) {
    this.data = data;
    this.tags = tags;
  }


  /**
   * Upgrade DB version
   */
  upgradeDb() {

    while (this.schemaVersion < DB_SCHEMA_VERSION) {

      switch (this.schemaVersion) {

        // upgrade ver. 1 --> 2
        // - initialize tags database
        case 1:
          if (!this.tags || Object.keys(this.tags).length === 0) {
            this.tags = {
              'private':  { color: '#00ff00' },
              'public':   { color: '#ff0000' },
            };
          }
          this.schemaVersion = 2;
          break;

          // // upgrade ver. 2 --> 3
          // case 1:
          // dbContent.schemaVersion = 3;
          // break;

      }

    }

  }

}