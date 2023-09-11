import { Recording } from 'src/app/models/recording';
import { Component, Input } from '@angular/core';
import { ModalBaseComponent } from '../modal-base/modal-base.component';

@Component({
  selector: 'app-contact-selector',
  templateUrl: './contact-selector.component.html',
  styleUrls: ['./contact-selector.component.scss'],
})
export class ContactSelectorComponent extends ModalBaseComponent {

  @Input({ required: true }) contacts!: string[];
  @Input({ required: true }) recording!: Recording;

  constructor() {
    super('contact-selector');
  }

  protected associate(contact: string) {
    this.recording.opName = contact;
    this.closeModal();
  }
}
