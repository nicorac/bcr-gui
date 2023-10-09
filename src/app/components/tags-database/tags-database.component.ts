import { TagData, TagReference, Tags } from 'src/app/models/tags';
import { RecordingsService } from 'src/app/services/recordings.service';
import { Component, ElementRef, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { TagEditorComponent } from './tag-editor.component';

@Component({
  selector: 'app-tags-database',
  templateUrl: './tags-database.component.html',
  styleUrls: ['../tags-component/shared.scss','./tags-database.component.scss'],
})
export class TagsDatabaseComponent implements OnInit {

  // references to Tags DB
  protected tags: Tags = {};
  protected tagRefs: TagReference[] = [];
  protected selectedRef?: TagReference;

  protected editor?: HTMLIonModalElement;

  constructor(
    protected modalController: ModalController,
    protected recordingsService: RecordingsService,
    protected ref: ElementRef<HTMLIonModalElement>,
  ) { }

  ngOnInit() {

    // set own class
    this.ref.nativeElement.parentElement?.classList.add('tags-database-modal');

    // fill sorted & cloned tags DB
    this.tags = this.recordingsService.tags;
    this.tagRefs = Object.keys(this.tags);
    this.tagRefs.sort();
  }


  async add() {

  }

  async edit() {

    if (!this.selectedRef) return;

    this.editor = await this.modalController.create({
      component: TagEditorComponent,
      backdropDismiss: false,
      componentProps: <TagEditorComponent> {
        title: 'Edit tag',
        tagRef: this.selectedRef,
        tagData: {... this.tags[this.selectedRef] },
        onConfirm: (tagRef: TagReference, tagData: TagData) => {
        //   // this.selectedTags = sel;
        //   this.selectedTagsChange.next(sel);
        },
      }
    });
    this.editor.onWillDismiss().then(() => this.editor = undefined);
    this.editor.present();

  }

  delete() {
    throw new Error('Method not implemented.');
  }

  onClose() {
    this.modalController.dismiss();
  }

}
