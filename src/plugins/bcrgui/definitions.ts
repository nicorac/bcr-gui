/**
 * Error codes returned on failures
 */
export const ErrorCode = {
  ERR_USER_CANCELED: "ERR_USER_CANCELED",
  ERR_NOT_FOUND: "ERR_NOT_FOUND",
} as const;

/**
 * State of the Xposed dialer integration (play button in the phone app call log)
 */
export interface DialerIntegrationStatus {
  /**
   * true when a Xposed framework is installed AND BCR-GUI is enabled as a module
   * AND scoped to BCR-GUI itself.
   * When false the three cases can't be told apart, so the UI must cover them all.
   */
  moduleActive: boolean;
  /** True only when the module hooked BCR-GUI's own process (needs it in scope) */
  selfProbeActive: boolean;
  /** Epoch ms of the last query from the dialer, 0 if it has never reached us */
  lastDialerContact: number;
  /** Version reported by the loaded module code */
  moduleVersion: string;
  /** Version shipped in this APK: a mismatch means a host app still runs an old module */
  expectedModuleVersion: string;
  /** Package of the current default dialer (the only app allowed to read recordings) */
  defaultDialer: string|null;
  defaultDialerLabel: string|null;
  /** Package of a detected Xposed manager app, null if none is visible */
  xposedManager: string|null;
}

export interface BcrGui {

  /**
   * Open the default Android dialog to select
   * an existing contact or create a new one
   */
  createOrEditContact(options: { displayName?: string, phoneNumber?: string }): Promise<{ contactUri: string, displayName: string }>;

  /**
   * Return the state of the Xposed dialer integration
   */
  getDialerIntegrationStatus(): Promise<DialerIntegrationStatus>;

  /**
   * Open the installed Xposed manager app (rejects with ERR_NOT_FOUND if none)
   */
  openXposedManager(): Promise<void>;

  /**
   * Read the diagnostics the dialer-side module last pushed over.
   *
   * The module runs inside the phone app's process and can only write to that app's
   * own storage, which BCR-GUI cannot read, so it hands its buffer across instead.
   */
  readDialerDiagnostics(): Promise<{
    available: boolean;
    content: string;
    /** Epoch ms of the last push, 0 if the module has never reached us */
    collectedAt: number;
  }>;

}
