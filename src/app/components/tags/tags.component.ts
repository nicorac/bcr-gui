/* eslint-disable @angular-eslint/no-input-rename */
import { TagReference } from 'src/app/models/tags';
import { RecordingsService } from 'src/app/services/recordings.service';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { TagSelectorModalComponent } from './tag-selector-modal.component';

@Component({
  selector: 'app-tags',
  templateUrl: './tags.component.html',
  styleUrls: ['./tags.component.scss', './shared.scss'],
})
export class TagsComponent {

  // currently selected tags
  @Input({ transform: cloneAndSort }) selectedTags: TagReference[] = [];
  @Output() selectedTagsChange = new EventEmitter<TagReference[]>();

  // defined tags
  protected tags = this.recordingsService.tags;

  // readonly mode
  @Input() readonly = false;

  private selector?: HTMLIonModalElement;

  constructor(
    protected recordingsService: RecordingsService,
    protected modalController: ModalController,
  ) { }

  /**
   * Show tag selector modal
   */
  public async showSelector() {

    if (this.readonly || this.selector) return;

    this.selector = await this.modalController.create({
      component: TagSelectorModalComponent,
      backdropDismiss: false,
      componentProps: <TagSelectorModalComponent> {
        selectedTags: this.selectedTags,
        confirmHandler: (sel: TagReference[]) => {
          // this.selectedTags = sel;
          this.selectedTagsChange.next(sel);
        },
      }
    });
    this.selector.onWillDismiss().then(() => this.selector = undefined);
    this.selector.present();

  }

}

function cloneAndSort(value: TagReference[]): TagReference[] {
  const v = [...value];
  v.sort();
  return v;
}