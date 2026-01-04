export interface BcrGui {

  /**
   * Open the default Android dialog to select
   * an existing contact or create a new one
   */
  createOrEditContact(options: { displayName?: string, phoneNumber?: string }): Promise<{ contactUri: string, displayName: string }>;

  /**
   * Launch an Android activity from BCR app
   */
  launchActivity(options: { component: string }): Promise<void>;                                                      
}
