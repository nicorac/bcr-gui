
import { ContactPayload } from '@capacitor-community/contacts';
import { SettingsService } from '../services/settings.service';
import { cleanupPhoneNumber } from '../utils/phoneNumbers';

/**
 * Implements a map between phone numbers and display names of contacts.
 *
 * <phone_number> => <display_name>
 *
 * If a contact has more than one number, multiple entries will be added.
 * If the same number is shared between more than one contact, then the last display name found is returned.
 *
 * Phone numbers are automatically cleaned within the internal dataset.
 */
export class NumberDisplayNameMap {

  private data = new Map<string, string>();

  constructor(
    contacts: ContactPayload[],
    private settings: SettingsService
  ) {

    // for each contact add an item for each contact phone number
    for (const cont of contacts) {

      // get defined and cleaned contact numbers
      const contNumbers = cont.phones?.filter(n => n).map(p => cleanupPhoneNumber(p!.number!)) || [];
      if (contNumbers?.length) {

        // get contact display name
        const contDisplayName = this.getContactDisplayName(cont);

        // fill results map
        for (const contactNumber of contNumbers) {
          this.addItem(contactNumber, contDisplayName);
        }

      }

    }

  }

  /**
   * Find an element with the given phone number.
   * If not found, retry by prepending the default country prefix.
   *
   * @param phoneNumber Phone number to search for
   * @returns Display name of the (last) contact associated with phoneNumber
   */
  public getDisplayName(phoneNumber: string): string|undefined {

    phoneNumber = cleanupPhoneNumber(phoneNumber);
    let displayName = this.data.get(phoneNumber);

    // if original phone number can't be found...
    if (!displayName && this.settings.defaultCountryPrefix) {
      // ...if number has country prefix, try WITHOUT it
      if (phoneNumber.startsWith(this.settings.defaultCountryPrefix)) {
        phoneNumber = phoneNumber.substring(this.settings.defaultCountryPrefix.length);
      }
      // ...otherwise try WITH it
      else {
        phoneNumber = this.settings.defaultCountryPrefix.trim() + phoneNumber;
      }
      displayName = this.data.get(phoneNumber);
    }
    return displayName;
  }

  /**
   * Add/update an element within the collection.
   * Phone number will be cleaned before addition.
   * Empty/invalid phone numbers are trashed.
   *
   * @returns true on success, false on failure.
   */
  private addItem(phoneNumber: string, displayName: string): boolean {
    phoneNumber = cleanupPhoneNumber(phoneNumber);
    if (phoneNumber) {
      this.data.set(cleanupPhoneNumber(phoneNumber), displayName);
      return true;
    }
    else {
      return false;
    }
  }

  /**
   * Extract the display name from the given contact
   */
  private getContactDisplayName(contact: ContactPayload, defaultValue = '<none>'): string {
    return contact?.name?.display ?? defaultValue;
  }

}
