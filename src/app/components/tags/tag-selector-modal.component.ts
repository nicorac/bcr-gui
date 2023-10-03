import { TagReference } from 'src/app/models/tags';
import { RecordingsService } from 'src/app/services/recordings.service';
import { Component, ElementRef, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-tag-selector-modal',
  templateUrl: './tag-selector-modal.component.html',
  styleUrls: ['./tag-selector-modal.component.scss', './shared.scss'],
})
export class TagSelectorModalComponent implements OnInit {

  // currently selected tags
  selectedTags: TagReference[] = [];
  confirmHandler?: (newSelection: TagReference[]) => void;

  // object to store selection
  // key is the TagReference, boolean value is selection status
  protected selectionMap: Record<TagReference, boolean> = {};

  // available tags
  protected definedTags = this.recordingsService.tags;
  protected definedTagRefsSorted!: TagReference[];


  constructor(
    protected mc: ModalController,
    protected recordingsService: RecordingsService,
    protected ref: ElementRef<HTMLIonModalElement>,
  ) { }


  ngOnInit() {

    // set own class
    this.ref.nativeElement.parentElement?.classList.add('tag-selector-modal');

    // fill selection map object
    for (const tr of this.selectedTags) {
      this.selectionMap[tr] = true;
    }

    // extract tag refs and sort them by selected + tagname
    this.definedTagRefsSorted = Object.keys(this.recordingsService.tags);
    this.definedTagRefsSorted.sort((a, b) =>
      ((this.selectionMap[b] ? 1 : 0) - (this.selectionMap[a] ? 1 : 0)) || a.localeCompare(b)
    );

  }

  /**
   * Toggles the selection state of the given tag reference
   */
  toggleSelection(tagRef: TagReference) {
    this.selectionMap[tagRef] = !this.selectionMap[tagRef];
  }

  /**
   * Toggles the selection state of the given tag reference
   */
  clearSelection() {
    this.selectionMap = {};
  }

  onClose() {
    this.mc.dismiss();
  }

  onConfirm() {
    // extract names of selected tag references and emit value
    const tagRefs = Object.entries(this.selectionMap)
      .filter(([key, val]) => val)
      .map(([key, val]) => key);
    tagRefs.sort();
    this.selectedTags = tagRefs;
    this.confirmHandler?.(tagRefs);
    this.mc.dismiss();
  }

}
