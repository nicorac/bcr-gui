/**
 * Error codes returned on failures
 */
export const ErrorCode = {
  ERR_USER_CANCELED: "ERR_USER_CANCELED",
} as const;

// single phone number entry (could exist more than one for a single contact)
export interface ContactData {
  number: string,         // phone number in E.164 format
  rawNumber: string,      // phone number as stored in contact
  displayName: string,    // contact displayName
  localizedLabel: string, // label associated with this phone number
}

export interface BcrGui {

  getContactsIndexedByE164(): Promise<{ contacts: Record<string, ContactData> }>;

  formatNumberToE164(data: {number: string}): Promise<{ number: string}>;

  /**
   * Open the default Android dialog to select
   * an existing contact or create a new one
   */
  createOrEditContact(options: { displayName?: string, phoneNumber?: string }): Promise<{ contactUri: string, displayName: string }>;

  /**
   * Restart the app
   */
  restartApp(): void;

}
