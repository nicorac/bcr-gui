import { AudioPlayerComponent } from 'src/app/components/audio-player/audio-player.component';
import { ActionButton } from 'src/app/components/header/header.component';
import { TagsComponent } from 'src/app/components/tags/tags.component';
import { Recording } from 'src/app/models/recording';
import { Filter, SortMode } from 'src/app/pipes/recordings-sort-filter.pipe';
import { ToHmsPipe } from 'src/app/pipes/to-hms.pipe';
import { MessageBoxService } from 'src/app/services/message-box.service';
import { RecordingsService } from 'src/app/services/recordings.service';
import { SettingsService } from 'src/app/services/settings.service';
import { bringIntoView } from 'src/app/utils/scroll';
import { AndroidSAF } from 'src/plugins/capacitorandroidsaf';
import { DatePipe } from '@angular/common';
import { Component } from '@angular/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { RefresherCustomEvent } from '@ionic/angular';
import version from '../../version';

@Component({
  selector: 'app-main',
  templateUrl: './main.page.html',
  styleUrls: ['./main.page.scss'],
})
export class MainPage {

  version = version;
  SortMode = SortMode;
  isMultiselect = false;
  isFilterPanelVisible = false;
  isFilterActive = false;

  // recordings filter
  filter = new Filter();

  actionButtons: ActionButton[] = [
    {
      // show filter button
      icon: () => this.isFilterActive ? 'filter-circle' : 'filter-circle-outline',
      visible: () => !this.isMultiselect,
      onClick: () => { this.isFilterPanelVisible = !this.isFilterPanelVisible }
    },
  ];

  constructor(
    private datePipe: DatePipe,
    private mbs: MessageBoxService,
    private toHms: ToHmsPipe,
    protected recordingsService: RecordingsService,
    protected settings: SettingsService,
  ) { }

  async refreshList(event: RefresherCustomEvent) {
    event.target.complete();
    this.clearSelection();
    await this.recordingsService.refreshContent();
  }

  clearSelection() {
    this.recordingsService.recordings.value.forEach(r => r.selected = false);
    this.isMultiselect = false;
  }

  getSelectedItems(): Recording[] {
    return this.recordingsService.recordings.value.filter(r => r.selected);
  }

  /**
   * Change selected status
   */
  async onItemClick(item: Recording) {

    if (item.selected) {
      if (this.isMultiselect) {
        item.selected = false;
      }
      // disable multiselection if no element is still selected
      if (!this.getSelectedItems().length) {
        this.isMultiselect = false;
      }
    }
    else {
      if (!this.isMultiselect) {
        this.clearSelection();
      }
      item.selected = true;
      if (!this.isMultiselect) {
        bringIntoView('.items .selected');
      }
    }

  }

  /**
   * Deletes the given recording file (and its companion JSON metadata)
   */
  async deleteItems(items: Recording[], player?: AudioPlayerComponent) {

    // stop player
    player?.pause();

    // show confirmation alert
    await this.mbs.showConfirm({
      header: 'Delete recording?',
      message: items.length === 1 ? 'Do you really want to delete selected recording?' : `Do you really want to delete ${items.length} recordings?`,
      cancelText: 'Cancel',
      confirmText: 'Delete',
      onConfirm: () => {
        this.recordingsService.deleteRecording(items);
        this.clearSelection();
      }
    });

  }

  /**
   * Show Android share dialog to share an audio file
   */
  async shareRecording(item: Recording) {

    // we need to create a temp copy of audio file in a "share accessible" location"
    // create parent dir
    const tempDir = 'shareDir';
    try {
      await Filesystem.mkdir({
        directory: Directory.Cache,
        path: tempDir,
      });
    }
    catch (error: any) {
      if (error.message == 'Directory exists') {
        // no error...
      }
      else {
        this.mbs.showError({
          message: `Error creating temp dir: ${tempDir}`,
          error: error,
        });
      }
    }

    // temp local file
    const tempFile = {
      directory: Directory.Cache,
      path: `${tempDir}/${item.audioFile}`,
    };

    // read audio file content
    let base64Content: string = '';
    try {
      ({ content: base64Content } = await AndroidSAF.readFile({ directory: this.settings.recordingsDirectoryUri, filename: item.audioFile }));
    } catch (error) {
      this.mbs.showError({
        message: `Error reading audio file: ${item.audioFile}`,
        error: error,
      });
      return;
    }

    // write local temp file
    await Filesystem.writeFile({
      ...tempFile,
      data: base64Content,
    });

    // get full tempfile path
    const { uri:tempFileUri } = await Filesystem.getUri(tempFile);

    // open default Android share dialog
    try {
      await Share.share({
        dialogTitle: 'Share call recording...',
        title: 'Call recording',
        text: this.getShareText(item),
        url: tempFileUri,
      });
      console.log("Completed");
    }
    catch (error: any) {
      if (error?.message === 'Share canceled') {
        console.warn('File share canceled');
        // not a real error...
      }
      else {
        this.mbs.showError({
          message: 'Error sharing audio file',
          error: error,
        });
      }
    }
    finally {
      // delete temp file
      await Filesystem.deleteFile(tempFile);
      console.log('Deleted temp file:', tempFile.path);
    }

  }

  /**
   * Return a string description of a recording, used when sharing file.
   */
  private getShareText(item: Recording) {

    return `
${item.opName}
Date: ${this.datePipe.transform(item.date, 'medium')}
Duration: ${this.toHms.transform(item.duration)}
`.trim();

  }

  /**
   * Start multiselection and select the given item
   */
  protected startMultiselection(item?: Recording) {
    if (!this.isMultiselect) {
      this.clearSelection()
      this.isMultiselect = true;
      if (item) {
        item.selected = true;
      }
    }
  }

  /**
   * Called by the searchbox
   */
  onSearchChanged($event: any) {
    this.clearSelection();
    this.filter = {
      ...this.filter,
      search: $event.target.value,
    };
    this.updateFilterStatus();
  }

  showTagsSelector(tagsComponent: TagsComponent) {
    tagsComponent.showSelector();
  }

  clearFilter() {
    this.filter = new Filter();
    this.isFilterActive = false;
  }

  updateFilterStatus() {
    this.isFilterActive = !!this.filter.search || this.filter.tags?.length > 0;
  }

}
