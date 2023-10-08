import { TagReference, Tags } from 'src/app/models/tags';
import { RecordingsService } from 'src/app/services/recordings.service';
import { Component, ElementRef, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-tag-editor',
  templateUrl: './tag-editor.component.html',
  styleUrls: ['./shared.scss','./tag-editor.component.scss'],
})
export class TagEditorComponent implements OnInit {

  // copies of the Tags DB
  protected tags: Tags = {};
  protected tagRefs: TagReference[] = [];
  protected selectedRef?: TagReference;


  constructor(
    protected mc: ModalController,
    protected recordingsService: RecordingsService,
    protected ref: ElementRef<HTMLIonModalElement>,
  ) { }

  ngOnInit() {

    // set own class
    this.ref.nativeElement.parentElement?.classList.add('tag-editor');

    // fill sorted & cloned tags DB
    this.tags = {...this.recordingsService.tags };
    this.tagRefs = Object.keys(this.tags);
    this.tagRefs.sort();
  }


  add() {
    throw new Error('Method not implemented.');
  }

  delete() {
    throw new Error('Method not implemented.');
  }

  onConfirm() {
    throw new Error('Method not implemented.');
  }

  onClose() {
    this.mc.dismiss();
  }

}
