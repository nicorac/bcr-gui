import { Subscription } from 'rxjs';
import { AudioPlayerComponent } from 'src/app/components/audio-player/audio-player.component';
import { ActionButton } from 'src/app/components/header/header.component';
import { Recording } from 'src/app/models/recording';
import { ToHmsPipe } from 'src/app/pipes/to-hms.pipe';
import { MessageBoxService } from 'src/app/services/message-box.service';
import { RecordingsService } from 'src/app/services/recordings.service';
import { SettingsService } from 'src/app/services/settings.service';
import { sortRecordings } from 'src/app/utils/recordings-sorter';
import { bringIntoView } from 'src/app/utils/scroll';
import { AndroidSAF } from 'src/plugins/androidsaf';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { DatePipe } from '@angular/common';
import { AfterViewInit, Component, ViewChild } from '@angular/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { RefresherCustomEvent } from '@ionic/angular';
import version from '../../version';

@Component({
  selector: 'app-main',
  templateUrl: './main.page.html',
  styleUrls: ['./main.page.scss'],
})
export class MainPage implements AfterViewInit {

  version = version;
  multiselect = false;
  actionButtons: ActionButton[] = [
    {
      icon: 'trash',
      visible: () => this.multiselect,
      onClick: () => { }
    },
    {
      icon: 'close',
      visible: () => this.multiselect,
      onClick: () => { this.clearSelection(); this.multiselect = false; }
    },
  ];
  protected itemsAll: Recording[] = [];
  protected items: Recording[] = [];
  protected topIndex = 0; // index of top shown recording
  protected itemHeight = 78;
  protected itemHeightSelected = this.itemHeight + 180;
  protected itemGap = 12;

  private _subs = new Subscription();

  @ViewChild(AudioPlayerComponent) player?: AudioPlayerComponent;
  @ViewChild(CdkVirtualScrollViewport) scrollViewport!: CdkVirtualScrollViewport;

  constructor(
    private datePipe: DatePipe,
    private mbs: MessageBoxService,
    private toHms: ToHmsPipe,
    protected recordingsService: RecordingsService,
    protected settings: SettingsService,
  ) { }

  async ionViewWillEnter() {

    // subscribe
    [
      this.recordingsService.recordings.subscribe((res) => {
        this.itemsAll = res;
        this.updateFilter();
      })
    ].forEach(s => this._subs.add(s));
  }

  /**
   * Stop the player before leaving the page
   */
  async ionViewWillLeave() {
    await this.stopPlayer();
  }

  async ngAfterViewInit() {
    await this.recordingsService.initialize();
  }

  async refreshList(event: RefresherCustomEvent) {
    event.target.complete();
    this.clearSelection();
    await this.recordingsService.refreshContent();
  }

  clearSelection() {
    this.recordingsService.recordings.value.forEach(r => r.selected = false);
    this.multiselect = false;
  }

  getSelectedItems(): Recording[] {
    return this.recordingsService.recordings.value.filter(r => r.selected);
  }

  updateFilter() {
    this.items = sortRecordings(this.itemsAll, this.settings.recordingsSortMode);
  }

  /**
   * Change selected status
   */
  async onItemClick(item: Recording) {

    if (item.selected) {
      if (this.multiselect) {
        item.selected = false;
      }
      // disable multiselection if no element is still selected
      if (!this.getSelectedItems().length) {
        this.multiselect = false;
      }
    }
    else {
      if (!this.multiselect) {
        this.clearSelection();
      }
      item.selected = true;
      if (!this.multiselect) {
        bringIntoView('.items .selected');
      }
    }

  }

  /**
   * Deletes the given recording file (and its companion JSON metadata)
   */
  async deleteItems(items: Recording[]) {

    // show confirmation alert
    await this.mbs.showConfirm({
      header: 'Delete recording?',
      message: items.length === 1 ? 'Do you really want to delete selected recording?' : `Do you really want to delete ${items.length} recordings?`,
      cancelText: 'Cancel',
      confirmText: 'Delete',
      onConfirm: async () => {
        // stop player
        await this.stopPlayer();
        this.recordingsService.deleteRecording(items);
        this.clearSelection();
      }
    });

  }

  /**
   * Show Android share dialog to share an audio file
   */
  async shareRecording(item: Recording, event: MouseEvent) {

    // disable button (operation could take some time if file is bigger)
    const iconButtonElem = (event.target as HTMLElement);
    iconButtonElem.classList.add('icon-button-waiting');

    // stop player
    await this.stopPlayer();

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
      path: `${tempDir}/${item.audioDisplayName}`,
    };

    // read audio file content
    let base64Content: string = '';
    try {
      ({ content: base64Content } = await AndroidSAF.readFile({ fileUri: item.audioUri }));
    } catch (error) {
      this.mbs.showError({
        message: `Error reading audio file: ${item.audioUri}`,
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
      // re-enable button
      iconButtonElem.classList.remove('icon-button-waiting');
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
    if (!this.multiselect) {
      this.clearSelection()
      this.multiselect = true;
      if (item) {
        item.selected = true;
      }
    }
  }

  /**
   * Default list scroll
   */
  onScroll(index: number) {
    this.topIndex = index;
  }

  /**
   * Scroll invoked by virtual scrollbar
   */
  onScrollbarDrag(index: number) {
    this.scrollViewport.scrollToIndex(index);
  }

  /**
   * Stop player (if it exists)
   */
  private async stopPlayer() {
    await this.player?.pause();
  }

}
