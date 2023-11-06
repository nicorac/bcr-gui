

export interface AndroidDateTimeSettingsPlugin {

  /**
   * Open Android SAF directory picker to select a directory and give RW access
   */
  is12Hours(): Promise<{ is12Hours: boolean }>;

}
