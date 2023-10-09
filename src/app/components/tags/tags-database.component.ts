import { TagReference, Tags } from 'src/app/models/tags';
import { RecordingsService } from 'src/app/services/recordings.service';
import { Component, ElementRef, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-tags-database',
  templateUrl: './tags-database.component.html',
  styleUrls: ['./shared.scss','./tags-database.component.scss'],
})
export class TagsDatabaseComponent implements OnInit {

  // references to Tags DB
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
    this.ref.nativeElement.parentElement?.classList.add('tags-database-modal');

    // fill sorted & cloned tags DB
    this.tags = this.recordingsService.tags;
    this.tagRefs = Object.keys(this.tags);
    this.tagRefs.sort();
  }


  add() {
    throw new Error('Method not implemented.');
  }

  edit() {
    throw new Error('Method not implemented.');
  }

  delete() {
    throw new Error('Method not implemented.');
  }

  onClose() {
    this.mc.dismiss();
  }

}
