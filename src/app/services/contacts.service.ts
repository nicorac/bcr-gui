import { AndroidSettings, NativeSettings } from 'capacitor-native-settings';
import { inject, Injectable } from '@angular/core';
import { Contacts } from '@capacitor-community/contacts';
import { PermissionState } from '@capacitor/core';
import { BcrGui } from '@plugins/bcrgui';
import { isPhoneNumber } from '../utils/phoneNumbers';
import { I18nService } from './i18n.service';
import { MessageBoxService } from './message-box.service';
import { SettingsService } from './settings.service';

@Injectable({
  providedIn: 'root',
})
export class ContactsService {

  private i18n = inject(I18nService);
  private mbs = inject(MessageBoxService);
  private settings = inject(SettingsService);

  /**
   * Returns a map between contact phone numbers (in E.164 format) and contacts.
   *
   * <phone_number> => <contact data>
   *
   * If a contact has more than one number, multiple entries will be added.
   * If the same number is shared between more than one contact, then the last found is returned.
   *
   */
  async getPhoneNumbersMap() {
    const { contacts } = await BcrGui.getContactsIndexedByE164();
    return contacts ?? {};
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
  async checkPermission(): Promise<PermissionState|'limited'> {

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
