import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { DatePipe } from '@angular/common';
import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, inject, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Clipboard } from '@capacitor/clipboard';
import { ActionSheetController, IonSearchbar, LoadingController, RefresherCustomEvent } from '@ionic/angular';
import { DatetimePipe } from '@pipes/datetime.pipe';
import { FilesizePipe } from '@pipes/filesize.pipe';
import { ToHmsPipe } from '@pipes/to-hms.pipe';
import { TranslatePipe } from '@pipes/translate.pipe';
import { AudioPlayerComponent, SkipDirection } from '@src/app/components/audio-player/audio-player.component';
import { CallIconComponent } from '@src/app/components/call-icon/call-icon.component';
import { ActionButton, HeaderComponent } from '@src/app/components/header/header.component';
import { VirtualScrollbarComponent } from '@src/app/components/virtual-scrollbar/virtual-scrollbar.component';
import { LongPressDirective } from '@src/app/directives/long-press.directive';
import { IonicBundleModule } from '@src/app/IonicBundle.module';
import { Recording } from '@src/app/models/recording';
import { ContactsService } from '@src/app/services/contacts.service';
import { I18nService } from '@src/app/services/i18n.service';
import { MessageBoxService } from '@src/app/services/message-box.service';
import { RecordingsService } from '@src/app/services/recordings.service';
import { SettingsService } from '@src/app/services/settings.service';
import { filterList } from '@src/app/utils/filterList';
import { sortRecordings } from '@src/app/utils/recordings-sorter';
import { bringIntoView } from '@src/app/utils/scroll';
import { untilTrue } from '@src/app/utils/waitForAsync';
import { AndroidSAF } from '@src/plugins/androidsaf';
import { ErrorCode } from '@src/plugins/bcrgui';
import version from '../../version';

@Component({
  selector: 'app-main',
  templateUrl: './main.page.html',
  styleUrls: ['./main.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AudioPlayerComponent,
    CallIconComponent,
    DatetimePipe,
    FilesizePipe,
    FormsModule,
    HeaderComponent,
    IonicBundleModule,
    LongPressDirective,
    ScrollingModule,
    ToHmsPipe,
    TranslatePipe,
    VirtualScrollbarComponent,
  ],
  providers: [
    ContactsService,
    DatePipe,
    ToHmsPipe,
  ]
})
export class MainPage implements AfterViewInit {

  protected version = version;
  protected isMultiselect = signal(false);
  protected isSearch = signal(false);
  protected searchValue = signal('');
  actionButtons: ActionButton[] = [
    {
      icon: () => this.searchValue() ? 'search-circle' : 'search-circle-outline',
      visible: () => !this.isMultiselect(),
      onClick: () => this.toggleSearchBar(),
    },
  ];
  selectedItem = signal<Recording | undefined>(undefined);
  selectedItemIndex = computed<number>(() => {
    const item = this.selectedItem();
    return this.items()?.findIndex(i => i === item) ?? -1;
  });

  // filtered items collection
  protected items = computed<Recording[]>(() => {
    // filter & sort
    let filteredItems = filterList(this.recordingsService.recordings(), this.searchValue(), r => `${r.opName} ${r.opNumber}`);
    filteredItems = sortRecordings(filteredItems, this.settings.recordingsSortMode);
    // reset selection if item is now missing
    untracked(() => {
      const selItem = this.selectedItem();
      if (selItem && !filteredItems.includes(selItem)) {
        this.clearSelection();
      }
    });
    // return sorted
    return filteredItems;
  });

  protected topIndex = signal(0); // index of top shown recording
  protected itemHeight = 78;
  protected itemGap = 12;

  private player = viewChild(AudioPlayerComponent);
  private scrollViewport = viewChild(CdkVirtualScrollViewport);
  private searchBar = viewChild(IonSearchbar);

  // services
  private asc = inject(ActionSheetController);
  private cdr = inject(ChangeDetectorRef);
  private contactsService = inject(ContactsService);
  private datePipe = inject(DatePipe);
  private i18n = inject(I18nService);
  private loadingCtrl = inject(LoadingController);
  private mbs = inject(MessageBoxService);
  private toHms = inject(ToHmsPipe);
  protected recordingsService = inject(RecordingsService);
  protected router = inject(Router);
  protected settings = inject(SettingsService);

  constructor() {
    // // DEBUG: automatically select first recording
    // if (!environment.production) {
    //   effect(() => {
    //     if (this.items()?.length) {
    //       setTimeout(() => this.onItemClick(this.items()[0]), 250);
    //     }
    //   });
    // }
  }

  async ionViewWillEnter() {

    // save reference to myself
    this.recordingsService.mainPageRef = this;

  }

  /**
   * Handle the VIEW intent request
   */
  async playIntentFile(viewIntentFilename: string, forceListRefresh = false) {

    // wait for refresh completion
    if (forceListRefresh) {
      await this.refreshList();
    }

    // wait for already running refresh
    // the await above could exit immediately if a refresh was already running
    await untilTrue(() => this.recordingsService.refreshProgress() === undefined);

    this.clearFilter();
    this.isMultiselect.set(false);

    // find the required filename
    const playItemIx = this.items().findIndex(i => i.audioUri === viewIntentFilename);
    if (playItemIx >= 0) {

      const playItem = this.items()[playItemIx];

      // ensure it's visible
      this.scrollViewport()?.scrollToIndex(playItemIx);

      // select & play it (need to wait for player initialization)
      playItem.selected = true;
      this.selectedItem.set(playItem);
      this.cdr.detectChanges(); // forcibly detect the .selected change above
      await untilTrue(() => this.player()?.recording() === playItem && this.player()!.isReady());
      this.player()?.play();

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
    // this._subs.unsubscribe();
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
    this.recordingsService.recordings().forEach(r => r.selected = false); // remove flag from itemsAll, just to stay safe...😉
    this.selectedItem.set(undefined);
    this.isMultiselect.set(false);
  }

  getSelectedItems(): Recording[] {
    return this.items().filter(r => r.selected);
  }

  /**
   * Show/hide the searchbar and set focus to search field
   */
  toggleSearchBar() {
    this.isSearch.update(v => !v);
    if (this.isSearch()) {
      setTimeout(() => this.searchBar?.()?.setFocus(), 50);
    }
  }

  clearFilter() {
    this.searchValue.set('');
    this.isSearch.set(false);
    // this.updateFilter();
  }

  /**
   * Change selected status
   */
  async onItemClick(item: Recording) {

    if (item.selected) {
      this.selectedItem.set(undefined);
      // if (this.isMultiselect()) {
        item.selected = false;
      // disable multiselection if no element is still selected
      if (this.isMultiselect() && !this.getSelectedItems().length) {
        this.isMultiselect.set(false);
      }
    }
    else {
      if (!this.isMultiselect()) {
        this.clearSelection();
      }
      item.selected = true;
      this.selectedItem.set(item);
      if (!this.isMultiselect()) {
        bringIntoView('.items .selected');
      }
    }

  }

  /**
   * Deletes the given recording file (and its companion JSON metadata)
   */
  async deleteItems(items: Recording[]) {

    this.player()?.pause();

    // show confirmation alert
    await this.mbs.showConfirm({
      header: this.i18n.get('HOME_DELETE_CONFIRM_TITLE'),
      message: this.i18n.get('HOME_DELETE_CONFIRM_TEXT', items.length),
      confirmText: this.i18n.get('LBL_DELETE'),
      onConfirm: async () => {
        this.clearSelection();

        // forcibly unload audio
        await this.player()?.unload();

        // show wait spinner
        const waitSpinner = await this.loadingCtrl.create({ cssClass: 'spinner', duration: 20000 });
        waitSpinner.present();

        // delete recordings and remove spinner
        this.recordingsService.deleteRecording(items).then(() => {
          waitSpinner.dismiss();
        });
      }
    });

  }

  /**
   * Edit the given item
   */
  async editItem(rec: Recording) {

    // stop player
    await this.player()?.pause();

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

    // find contact with that phone number
    const pnm = await this.contactsService.getPhoneNumbersMap();
    const displayName = pnm.getDisplayName(rec.opNumber);

    // contact found?
    if (displayName) {
      // show confirm
      await this.mbs.showConfirm({
        header: this.i18n.get('HOME_EDIT_SEARCHCONTACT_FOUND_TITLE'),
        message: this.i18n.get('HOME_EDIT_SEARCHCONTACT_SET_TO_ALL', { displayName: `<strong>${displayName}</strong>` }),
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
    })
    .then(async res => {

      // a new contact has been created (or an existing one was modified)
      console.log(`Created/edited contact: '${res.displayName}`);

      await this.mbs.showConfirm({
        header: this.i18n.get('HOME_EDIT_SEARCHCONTACT_FOUND_TITLE'),
        message: this.i18n.get('HOME_EDIT_SEARCHCONTACT_SET_TO_ALL', { displayName: res.displayName }),
        onConfirm: async () => {
          await this.recordingsService.setNameByNumber(rec.opNumber, res.displayName);
        }
      });

    })
    .catch(err => {
      // error ERR_USER_CANCELED is returned when user exits the contact editor without saving, we can just ignore it
      if (err.code !== ErrorCode.ERR_USER_CANCELED) {
        this.mbs.showError({
          error: err,
        });
      }
    });

  ;

  }

  /**
   * Select all items
   */
  async selectAll() {
    this.isMultiselect.set(true);
    this.items().forEach(i => i.selected = true); // select all VISIBLE items
  }

  /**
   * Show Android share dialog to share an audio file
   */
  async shareRecording(item: Recording, event: MouseEvent) {

    // stop player
    await this.stopPlayer();

    // open default Android share dialog
    try {
      await AndroidSAF.shareFile({
        uri: item.audioUri,
        text: this.getShareText(item),
      });
      console.log("Completed");
    }
    catch (error: any) {
      this.mbs.showError({
        appErrorCode: 'ERR_OS003',
        error: error,
      });
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
    if (!this.isMultiselect()) {
      this.clearSelection();
      this.isMultiselect.set(true);
      if (item) {
        item.selected = true;
      }
    }
  }

  /**
   * Default list scroll
   */
  onScroll(index: number) {
    this.topIndex.set(index);
  }

  /**
   * Stop player (if it exists)
   */
  private async stopPlayer() {
    await this.player()?.pause();
  }

  /**
   * Skip to previous/next item
   */
  protected onSkip(direction: SkipDirection) {
    // find first selected item index
    const selectedItemIndex = this.items().findIndex(i => i.selected);
    if (selectedItemIndex >= 0) {
      const newSelectedItem = this.items()[selectedItemIndex + (direction === 'next' ? +1 : -1)];
      if (newSelectedItem) {
        this.onItemClick(newSelectedItem);
      }
    }
  }

  protected trackByUri(idx: number, item: Recording) {
    return item.audioUri;
  }

}
