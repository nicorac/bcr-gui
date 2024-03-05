import { AndroidSettings, NativeSettings } from 'capacitor-native-settings';
import { BcrGui } from 'src/plugins/bcrgui';
import { Injectable } from '@angular/core';
import { ContactPayload, Contacts } from '@capacitor-community/contacts';
import { PermissionState } from '@capacitor/core';
import { I18nService } from './i18n.service';
import { MessageBoxService } from './message-box.service';
import { SettingsService } from './settings.service';

@Injectable()
export class ContactsService {

  constructor(
    private i18n: I18nService,
    private mbs: MessageBoxService,
    private settings: SettingsService,
  ) {}

  /**
   * test if the given string contains a phone number
   */
  isPhoneNumber(phoneNumber?: string): boolean {
    phoneNumber = phoneNumber?.trim() ?? '';
    return phoneNumber.length !== 0 && !/[^\d\.\-\+ ]/g.test(phoneNumber);
  }

  /**
   * Cleanup the given phone number by keeping only "+" and digits.
   */
  cleanupPhoneNumber(phoneNumber: string): string {
    return phoneNumber.replace(/[^\d\+]/g, '');
  }

  /**
   * Search contacts for the one with the given phone number (returns only the first match)
   */
  async getContactFromPhoneNumber(phoneNumber: string): Promise<ContactPayload|undefined> {

    // cleanup phonenumber
    phoneNumber = this.cleanupPhoneNumber(phoneNumber);

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
      const numbers = contact.phones?.filter(n => n).map(p => this.cleanupPhoneNumber(p!.number!));
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
   * Show default Android create/edit contact dialog
   */
  public createOrEditContact(data: { displayName?: string, phoneNumber: string }) {

    return BcrGui.createOrEditContact({
      displayName: (data.displayName && !this.isPhoneNumber(data.displayName)) ? data.displayName : undefined,
      phoneNumber: data.phoneNumber
    });

  }

  /**
   * Extract the display name from the given contact
   */
  getContactDisplayName(contact: ContactPayload, defaultValue = '<none>'): string {
    return contact?.name?.display ?? defaultValue;
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
