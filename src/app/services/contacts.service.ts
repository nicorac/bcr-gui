import { AndroidSettings, NativeSettings } from 'capacitor-native-settings';
import { Injectable } from '@angular/core';
import { ContactPayload, Contacts, PhoneType } from '@capacitor-community/contacts';
import { PermissionState } from '@capacitor/core';
import { MessageBoxService } from './message-box.service';

@Injectable()
export class ContactsService {

  constructor(
    private mbs: MessageBoxService
  ) {}

  /**
   * test if the given string contains a phone number
   */
  isPhoneNumber(phoneNumber: string): boolean {
    phoneNumber = phoneNumber?.trim() ?? '';
    return phoneNumber.length !== 0 && !/[^\d\.\-\+ ]/g.test(phoneNumber);
  }

  /**
   * Cleanup the given phone number by keeping only "+" and digits
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

    // find and return the first match
    return res.contacts.find(item =>
      item.phones?.filter(i => i.number)
        .map(i => this.cleanupPhoneNumber(i.number!))
        .includes(phoneNumber)
    );

  }

  /**
   * Create a new contact with the given phone number
   */
  async createContactWithPhoneNumber(contactName: string, phoneNumber: string): Promise<void> {

    // cleanup phonenumber
    phoneNumber = this.cleanupPhoneNumber(phoneNumber);

    // create new contact
    const contactNameParts = contactName.split(/[\s]+/g);
    const res = await Contacts.createContact({
      contact: {
        name: {
          given: contactNameParts[0],
          family: contactNameParts.slice(1).join(' '),
        },
        phones: [
          { type: PhoneType.Home , number: phoneNumber }
        ],
      }
    });

    // open the created contact
    if (res?.contactId) {
      Contacts.openContact({ contactId: res.contactId });
    }

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
        header: 'Contacts permission needed',
        message: [
          'This feature needs Contacts permission to work.',
          'If you were already asked for permission (and denied it), please open application settings and allow Contacts permission...',
        ],
        cancelText: 'Cancel',
        confirmText: 'Open app settings',
        onConfirm: async () => {
          // open application settings
          await NativeSettings.openAndroid({
            option: AndroidSettings.ApplicationDetails
          });
        }
      });
    }

    // return permission status
    return perm;

  }

}
