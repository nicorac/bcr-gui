import { Recording } from 'src/app/models/recording';
import { MessageBoxService } from 'src/app/services/message-box.service';
import { RecordingsService } from 'src/app/services/recordings.service';
import { SettingsService } from 'src/app/services/settings.service';
import { ToastService } from 'src/app/services/toast.service';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Contacts } from '@capacitor-community/contacts';
import { ContactSelectorComponent } from '../contact-selector/contact-selector.component';
import { ModalBaseComponent } from '../modal-base/modal-base.component';

@Component({
  selector: 'app-metadata-editor',
  templateUrl: './metadata-editor.component.html',
  styleUrls: ['./metadata-editor.component.scss'],
})
export class MetadataEditorComponent extends ModalBaseComponent implements OnInit, OnDestroy {

  // original record as passed in by caller
  private originalItem!: Recording;

  // edited record (clone of original record)
  protected editedItem!: Recording;

  // search result
  protected searchResult?: string[];

  @Input({ required: true })
  set recording(item: Recording) {
    this.originalItem = item;
    this.editedItem = { ...item };
  }

  constructor(
    private mbs: MessageBoxService,
    private recordingsService: RecordingsService,
    private toastService: ToastService,
    protected settings: SettingsService,
  ) {
    super('metadata-editor');
  }

  async save() {
    // merge edited data into original record
    let changed = false;
    for (const key in this.editedItem) {
      if ((<any>this.originalItem)[key] !== (<any>this.editedItem)[key]) {
        (<any>this.originalItem)[key] = (<any>this.editedItem)[key];
        changed = true;
      }
    }
    // save changes
    if (changed) {
      await this.recordingsService.save();
    }
    return this.closeModal();
  }

  /**
   * Return the name(s) of the contact(s) having the given phone number.
   * It could return more than one result.
   * Search is done with "endsWith" algorithm to avoid prefixes issues.
   *
   * @param phoneNumber
   * @returns
   */
  private async findContactByNumber(phoneNumber: string): Promise<string[]> {

    // check contact access permissions
    const perm = await Contacts.requestPermissions();
    if (perm.contacts !== 'granted') {
      return [];
    }

    const { contacts } = await Contacts.getContacts({
      projection: {
        // Specify which fields should be retrieved.
        name: true,
        phones: true,
      }
    });

    // cleanup phone number (remove any non-digit char)
    phoneNumber = phoneNumber.replace(/[^\d]/gi, '');

    // filter results
    const result: string[] = [];
    for (const c of contacts) {
      if (!c.name?.display) continue;
      if (!c.phones?.length) continue;
      for (const pn of c.phones) {
        const cleanedPn = pn.number?.replace(/[^\d]/gi, '') ?? '';
        if (phoneNumber.endsWith(cleanedPn) || cleanedPn.endsWith(phoneNumber)) {
          result.push(c.name?.display);
          break;
        }
      }
    }

    // sort and return
    result.sort();
    return result;
  }

  /**
   * Search a contact with this number and show a selection dialog
   */
  protected async searchNumber(item: Recording) {

    this.searchResult = await this.findContactByNumber(item.opNumber);
    if (this.searchResult?.length) {
      // show selection modal
      const selector = await this.modalCtrl.create({
        component: ContactSelectorComponent,
        componentProps: <ContactSelectorComponent> {
          contacts: this.searchResult,
          recording: item,
        }
      });
      await selector.present();
    }
    else {
      await this.toastService.showWarning({
        message: 'No contact has been found with this phone number.'
      });
    }
  }

}
