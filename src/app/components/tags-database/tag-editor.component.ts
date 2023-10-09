import { TagData, TagReference } from 'src/app/models/tags';
import { Component, ElementRef, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-tag-editor',
  templateUrl: './tag-editor.component.html',
  styleUrls: ['../tags-component/shared.scss', './tag-editor.component.scss'],
})
export class TagEditorComponent implements OnInit {

  public title!: string;
  public tagRef!: TagReference;
  public tagData!: TagData;

  public onConfirm?: (tagRef: TagReference, tagData: TagData) => void;

  protected colorPalette = [
    '#000000', '#000055', '#0000aa', '#0000ff', '#005500', '#005555', '#0055aa', '#0055ff',
    '#00aa00', '#00aa55', '#00aaaa', '#00aaff', '#00ff00', '#00ff55', '#00ffaa', '#00ffff',
    '#550000', '#550055', '#5500aa', '#5500ff', '#555500', '#555555', '#5555aa', '#5555ff',
    '#55aa00', '#55aa55', '#55aaaa', '#55aaff', '#55ff00', '#55ff55', '#55ffaa', '#55ffff',
    '#aa0000', '#aa0055', '#aa00aa', '#aa00ff', '#aa5500', '#aa5555', '#aa55aa', '#aa55ff',
    '#aaaa00', '#aaaa55', '#aaaaaa', '#aaaaff', '#aaff00', '#aaff55', '#aaffaa', '#aaffff',
    '#ff0000', '#ff0055', '#ff00aa', '#ff00ff', '#ff5500', '#ff5555', '#ff55aa', '#ff55ff',
    '#ffaa00', '#ffaa55', '#ffaaaa', '#ffaaff', '#ffff00', '#ffff55', '#ffffaa', '#ffffff',
  ];

  constructor(
    protected mc: ModalController,
    protected ref: ElementRef<HTMLIonModalElement>,
  ) { }

  ngOnInit() {
    // set own class
    this.ref.nativeElement.parentElement?.classList.add('tag-editor');
  }

  cancel() {
    this.mc.dismiss();
  }

  confirm() {
    this.onConfirm?.(this.tagRef, this.tagData);
    this.cancel();
  }

}
