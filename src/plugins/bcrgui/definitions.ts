/**
 * Error codes returned on failures
 */
export const ErrorCode = {
  ERR_USER_CANCELED: "ERR_USER_CANCELED",
} as const;

export interface BcrGui {

  /**
   * Open the default Android dialog to select
   * an existing contact or create a new one
   */
  createOrEditContact(options: { displayName?: string, phoneNumber?: string }): Promise<{ contactUri: string, displayName: string }>;

}
