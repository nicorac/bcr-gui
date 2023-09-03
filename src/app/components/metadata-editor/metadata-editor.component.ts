import { Recording } from 'src/app/models/recording';
import { RecordingsService } from 'src/app/services/recordings.service';
import { Component, ElementRef, Input, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-metadata-editor',
  templateUrl: './metadata-editor.component.html',
  styleUrls: ['./metadata-editor.component.scss'],
})
export class MetadataEditorComponent implements OnInit {

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
    private ref: ElementRef<HTMLElement>,
    private modalCtrl: ModalController,
    private recordingsService: RecordingsService,
  ) {}

  ngOnInit(): void {
    this.ref.nativeElement.parentElement?.classList.add('metadata-editor');
  }

  cancel() {
    return this.modalCtrl.dismiss();
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
      await this.recordingsService.updateRecording(this.originalItem);
    }
    return this.modalCtrl.dismiss();
  }

}
