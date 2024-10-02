import { Subscription } from 'rxjs';
import { AudioPlayerComponent } from 'src/app/components/audio-player/audio-player.component';
import { ActionButton } from 'src/app/components/header/header.component';
import { Recording } from 'src/app/models/recording';
import { ToHmsPipe } from 'src/app/pipes/to-hms.pipe';
import { ContactsService } from 'src/app/services/contacts.service';
import { I18nService } from 'src/app/services/i18n.service';
import { MessageBoxService } from 'src/app/services/message-box.service';
import { RecordingsService } from 'src/app/services/recordings.service';
import { SettingsService } from 'src/app/services/settings.service';
import { filterList } from 'src/app/utils/filterList';
import { sortRecordings } from 'src/app/utils/recordings-sorter';
import { bringIntoView } from 'src/app/utils/scroll';
import { asyncWaitForCondition } from 'src/app/utils/waitForAsync';
import { AndroidSAF } from 'src/plugins/androidsaf';
import { AudioPlayer } from 'src/plugins/audioplayer';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { DatePipe } from '@angular/common';
import { AfterViewInit, Component, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Clipboard } from '@capacitor/clipboard';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { ActionSheetController, IonSearchbar, RefresherCustomEvent } from '@ionic/angular';
import version from '../../version';

@Component({
  selector: 'app-main',
  templateUrl: './main.page.html',
  styleUrls: ['./main.page.scss'],
})
export class MainPage implements AfterViewInit {

  version = version;
  isMultiselect = false;
  isSearch = false;
  searchValue = '';
  actionButtons: ActionButton[] = [
    {
      icon: () => this.searchValue ? 'search-circle' : 'search-circle-outline',
      visible: () => !this.isMultiselect,
      onClick: () => this.toggleSearchBar(),
    },
  ];
  protected itemsAll: Recording[] = [];
  protected items: Recording[] = [];
  protected topIndex = 0; // index of top shown recording
  protected itemHeight = 78;
  protected itemHeightSelected = this.itemHeight + 180;
  protected itemGap = 12;
  protected isDraggingCursor = false;

  private _subs = new Subscription();

  @ViewChild(AudioPlayerComponent) player?: AudioPlayerComponent;
  @ViewChild(CdkVirtualScrollViewport) scrollViewport!: CdkVirtualScrollViewport;
  @ViewChild('searchBar') searchBar!: IonSearchbar;

  constructor(
    private asc: ActionSheetController,
    private contactsService: ContactsService,
    private datePipe: DatePipe,
    private i18n: I18nService,
    private mbs: MessageBoxService,
    private toHms: ToHmsPipe,
    protected recordingsService: RecordingsService,
    protected router: Router,
    protected settings: SettingsService,
  ) { }

  async ionViewWillEnter() {

    // save reference to myself
    this.recordingsService.mainPageRef = this;

    // set audio output
    await AudioPlayer.setConfiguration({ enableEarpiece: this.settings.enableEarpiece });

    // subscribe
    [
      this.recordingsService.recordings.subscribe((res) => {
        this.clearSelection();
        this.itemsAll = res;
        this.updateFilter();
      })
    ].forEach(s => this._subs.add(s));

  }

  /**
   * Handle the VIEW intent request
   */
  async playIntentFile(viewIntentFilename: string, forceListRefresh = false) {

    // wait for refresh completion
    if (forceListRefresh) {
      await this.refreshList();
    }

    this.clearFilter();

    // find the required filename
    const playItemIx = this.items.findIndex(i => i.audioUri === viewIntentFilename);
    if (playItemIx >= 0) {

      const playItem = this.items[playItemIx];

      // ensure it's visible
      this.scrollViewport.scrollToIndex(playItemIx);

      // select it
      playItem.selected = true;

      // play it (need to wait for player initialization)
      asyncWaitForCondition(
        () => this.player?.recording === playItem && this.player.isReady(),
        () => this.player!.play(),
      );

    }
    else if (!forceListRefresh) {
      // retry forcing list refresh
      this.playIntentFile(viewIntentFilename, true);
    }
    else {
      // error
      this.mbs.showError({
        appErrorCode: 'ERR_OS006',
        appErrorArgs: {
          appname: 'BCR-GUI',
          filename: viewIntentFilename,
        },
      });
    }

  }

  /**
   * Stop the player before leaving the page
   */
  async ionViewWillLeave() {
    // clear reference to myself
    this.recordingsService.mainPageRef = undefined;

    await this.stopPlayer();
    this._subs.unsubscribe();
  }

  async ngAfterViewInit() {
    await this.recordingsService.initialize();
  }

  refreshList(event?: RefresherCustomEvent) {
    event?.target.complete();
    this.clearSelection();
    return this.recordingsService.refreshContent();
  }

  clearSelection() {
    this.itemsAll.forEach(r => r.selected = false); // remove flag from itemsAll, just to stay safe...😉
    this.isMultiselect = false;
  }

  getSelectedItems(): Recording[] {
    return this.items.filter(r => r.selected);
  }

  /**
   * Show/hide the searchbar and set focus to search field
   */
  toggleSearchBar() {
    this.isSearch = !this.isSearch;
    if (this.isSearch) {
      setTimeout(() => this.searchBar.setFocus(), 50);
    }
  }

  clearFilter() {
    this.searchValue = '';
    this.isSearch = false;
    this.updateFilter();
  }

  /**
   * Sort & filter recordings
   */
  updateFilter() {

    let res = this.itemsAll;

    // filter
    if (this.searchValue) {
      res = filterList(res, this.searchValue, r => `${r.opName} ${r.opNumber}`);
      // close any open player to let the list update without leaving "orphaned" player IDs
      this.clearSelection();
    }

    // sort
    this.items = sortRecordings(res, this.settings.recordingsSortMode);
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
  async deleteItems(items: Recording[]) {

    // show confirmation alert
    await this.mbs.showConfirm({
      header: this.i18n.get('HOME_DELETE_CONFIRM_TITLE'),
      message: this.i18n.get('HOME_DELETE_CONFIRM_TEXT', items.length),
      confirmText: this.i18n.get('LBL_DELETE'),
      onConfirm: async () => {
        // forcibly unload audio
        await this.player?.unloadAudio();
        this.recordingsService.deleteRecording(items);
        this.clearSelection();
      }
    });

  }

  /**
   * Edit the given item
   */
  async editItem(rec: Recording) {

    // show sheet modal
    const sheet = await this.asc.create({
      header: this.i18n.get('HOME_EDIT_TITLE'),
      cssClass: 'actions edit-actions',
      buttons: [
        {
          text: this.i18n.get('HOME_EDIT_NAME'),
          icon: 'pencil',
          handler: async () => await this.editItem_Edit(rec),
        },
        {
          text: this.i18n.get('HOME_EDIT_COPYNUMBER'),
          icon: 'copy-outline',
          handler: async () => await Clipboard.write({ string: rec.opNumber }),
        },
        {
          text: this.i18n.get('HOME_EDIT_ADDEDIT'),
          icon: '/assets/icons/contacts-add.svg',
          handler: async () => await this.editItem_AddEditContact(rec),
        },
        {
          text: this.i18n.get('HOME_EDIT_SEARCHCONTACT'),
          icon: '/assets/icons/contacts-search.svg',
          handler: async () => await this.editItem_SearchContacts(rec),
        },
      ]
    });
    await sheet.present();

  }

  /**
   * Allow user to insert a custom name for this recording
   */
  private async editItem_Edit(rec: Recording) {

    await this.mbs.showInputBox({
      header: this.i18n.get('HOME_EDIT_NAME'),
      message: this.i18n.get('HOME_EDIT_NAME_PLACEHOLDER'),
      inputs: [
        { name: 'contactName', placeholder: this.i18n.get('LBL_CONTACT_NAME'), value: rec.opName },
        { name: 'phoneNumber', value: rec.opNumber, disabled: true },
      ],
      onConfirm: async (data) => {
        rec.opName = data?.contactName?.length ? data.contactName : rec.opNumber;
        await this.recordingsService.save();
      }
    });

  }

  /**
   * Search contacts for an item with the same phone number as the given recording
   */
  private async editItem_SearchContacts(rec: Recording) {

    // check Contacts permission
    if (await this.contactsService.checkPermission() !== 'granted') return;

    // find contact
    const contact = await this.contactsService.getContactFromPhoneNumber(rec.opNumber);

    // contact found?
    if (contact) {
      const displayName = this.contactsService.getContactDisplayName(contact);
      // show confirm
      await this.mbs.showConfirm({
        header: this.i18n.get('HOME_EDIT_SEARCHCONTACT_FOUND_TITLE'),
        message: this.i18n.get('HOME_EDIT_SEARCHCONTACT_SET_TO_ALL', { displayName: displayName }),
        onConfirm: async () => {
          await this.recordingsService.setNameByNumber(rec.opNumber, displayName);
        }
      });
    }
    else {
      // show failure message
      await this.mbs.showConfirm({
        header: this.i18n.get('HOME_EDIT_SEARCHCONTACT_NOT_FOUND_TITLE'),
        message: this.i18n.get('HOME_EDIT_SEARCHCONTACT_NOT_FOUND_TEXT'),
        confirmText: this.i18n.get('HOME_EDIT_SEARCHCONTACT_CREATE'),
        onConfirm: async () => {
          await this.editItem_AddEditContact(rec);
        }
      });

    }

  }

  private async editItem_AddEditContact(rec: Recording) {

    // check Contacts permission
    if (await this.contactsService.checkPermission() !== 'granted') return;

    // open the default "add or edit" contact selector
    this.contactsService.createOrEditContact({
      displayName: rec.opName,
      phoneNumber: rec.opNumber
    }).then(async res => {

      // a new contact has been created (or an existing one was modified)
      console.log(`Created/edited contact: '${res.displayName}`);

      await this.mbs.showConfirm({
        header: this.i18n.get('HOME_EDIT_SEARCHCONTACT_FOUND_TITLE'),
        message: this.i18n.get('HOME_EDIT_SEARCHCONTACT_SET_TO_ALL', { displayName: res.displayName }),
        onConfirm: async () => {
          await this.recordingsService.setNameByNumber(rec.opNumber, res.displayName);
        }
      });

    });

  }

  /**
   * Select all items
   */
  async selectAll() {
    this.isMultiselect = true;
    this.items.forEach(i => i.selected = true); // select all VISIBLE items
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
          appErrorCode: 'ERR_OS001',
          appErrorArgs: { dirname: tempDir },
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
        appErrorCode: 'ERR_OS002',
        appErrorArgs: { filename: item.audioUri },
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
          appErrorCode: 'ERR_OS003',
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
    if (!this.isMultiselect) {
      this.clearSelection();
      this.isMultiselect = true;
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
   * Stop player (if it exists)
   */
  private async stopPlayer() {
    await this.player?.pause();
  }

}
