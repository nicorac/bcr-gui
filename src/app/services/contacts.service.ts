import { AndroidSettings, NativeSettings } from 'capacitor-native-settings';
import { BcrGui } from 'src/plugins/bcrgui';
import { Injectable } from '@angular/core';
import { ContactPayload, Contacts } from '@capacitor-community/contacts';
import { PermissionState } from '@capacitor/core';
import { NumberDisplayNameMap } from '../models/NumberDisplayNameMap';
import { cleanupPhoneNumber, isPhoneNumber } from '../utils/phoneNumbers';
import { I18nService } from './i18n.service';
import { MessageBoxService } from './message-box.service';
import { SettingsService } from './settings.service';

@Injectable({
  providedIn: 'root',
})
export class ContactsService {

  constructor(
    private i18n: I18nService,
    private mbs: MessageBoxService,
    private settings: SettingsService,
  ) {}

  /**
   * @deprecated
   * Search contacts for the one with the given phone number (returns only the first match)
   */
  async getContactFromPhoneNumber(phoneNumber: string): Promise<ContactPayload|undefined> {

    // cleanup phonenumber
    phoneNumber = cleanupPhoneNumber(phoneNumber);

    // get contacts numbers
    const res = await Contacts.getContacts({
      projection: {
        name: true,
        phones: true,
      }
    });

    // find and return the first contact match
    for (const contact of res.contacts) {

      // get defined and cleaned contact numbers
      const numbers = contact.phones?.filter(n => n).map(p => cleanupPhoneNumber(p!.number!));
      if (numbers?.length) {

        // search first the plain number...
        for (const n of numbers) {
          if (n === phoneNumber) return contact;
        }

        // ...then tries adding the default country prefix
        // (special numbers could not have intl prefix)
        if (this.settings.defaultCountryPrefix) {
          for (const n of numbers) {
            if (n[0] !== '+' && (this.settings.defaultCountryPrefix + n === phoneNumber)) return contact;
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Returns a map between contact phone numbers and associated display name.
   *
   * <phone_number> => <display_name>
   *
   * If a contact has more than one number, multiple entries will be added.
   * If the same number is shared between more than one contact, then the last display name found is returned.
   *
   * NOTE: phone numbers are cleaned with cleanupPhoneNumber() function
   */
  async getPhoneNumbersMap(): Promise<NumberDisplayNameMap> {

    // read Android contacts
    const contacts = (await Contacts.getContacts({
      projection: {
        name: true,
        phones: true,
      }
    }))?.contacts ?? [];

    return new NumberDisplayNameMap(contacts, this.settings);

  }

  /**
   * Show default Android create/edit contact dialog
   */
  public createOrEditContact(data: { displayName?: string, phoneNumber: string }) {

    return BcrGui.createOrEditContact({
      displayName: (data.displayName && !isPhoneNumber(data.displayName)) ? data.displayName : undefined,
      phoneNumber: data.phoneNumber,
    });

  }

  /**
   * Check Android Contacts permission
   */
  async checkPermission(): Promise<PermissionState> {

    // check current permission status
    const { contacts: perm } = await Contacts.requestPermissions();

    // permission was already granted or user was already asked for and denied it
    if (perm !== 'granted') {
      // show info alert
      await this.mbs.showConfirm({
        header: this.i18n.get('CONTACTS_PERM_TITLE'),
        message: this.i18n.get('CONTACTS_PERM_TEXT'),
        confirmText: this.i18n.get('CONTACTS_PERM_CONFIRM'),
        onConfirm: async () => {
          // open application settings
          await NativeSettings.openAndroid({ option: AndroidSettings.ApplicationDetails });
        }
      });
    }

    // return permission status
    return perm;

  }

}
