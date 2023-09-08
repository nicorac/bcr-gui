import { Recording } from 'src/app/models/recording';
import { RecordingsService } from 'src/app/services/recordings.service';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
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

  @Input({ required: true })
  set recording(item: Recording) {
    this.originalItem = item;
    this.editedItem = { ...item };
  }

  constructor(
    private recordingsService: RecordingsService,
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

}
