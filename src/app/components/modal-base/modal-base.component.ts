/* eslint-disable @angular-eslint/contextual-lifecycle */
import { Subscription } from 'rxjs';
import { ElementRef, Inject, inject, Injectable, OnDestroy, OnInit } from '@angular/core';
import { ModalController, Platform } from '@ionic/angular';

/**
 * Base implementation of application modal dialog.
 * It intercepts hardware BACK button to close the dialog.
 */
@Injectable()
export abstract class ModalBaseComponent implements OnInit, OnDestroy {

  // back button interceptor
  private backSubs!: Subscription;

  protected constructor(
    @Inject(null) protected dialogClass: string,
    protected modalCtrl: ModalController = inject(ModalController),
    protected ref: ElementRef<HTMLElement> = inject(ElementRef<HTMLElement>),
    protected platform: Platform = inject(Platform),
  ) { }

  ngOnInit() {
    this.ref.nativeElement.parentElement?.classList.add('modal-base', this.dialogClass);
    this.backSubs = this.platform.backButton.subscribeWithPriority(999, async() => {
      this.closeModal();
    });
  }

  ngOnDestroy() {
    this.backSubs?.unsubscribe();
  }

  async closeModal() {
    return await this.modalCtrl.dismiss();
  }
}
