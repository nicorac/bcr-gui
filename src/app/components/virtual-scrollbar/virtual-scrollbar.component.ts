/* eslint-disable @angular-eslint/no-input-rename */
import { debounceTime, Subject, Subscription } from 'rxjs';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { ChangeDetectionStrategy, Component, ElementRef, input, model, OnDestroy, OnInit, signal } from '@angular/core';

const MIN_CURSOR_HEIGHT = 40; // min cursor height in px

/**
 * This componnt "attaches" itself to a list and shows a virtual scrollbar beside it
 */
@Component({
  selector: 'app-virtual-scrollbar',
  templateUrl: './virtual-scrollbar.component.html',
  styleUrls: ['./virtual-scrollbar.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VirtualScrollbarComponent implements OnInit, OnDestroy {

  // protected isDragging = false;
  protected readonly cursorHeight = 48;
  protected isVisible = signal(false);
  protected cursorYPos = signal(0);     // cursor current Y position
  private cursorYRange = 0;     // Y cursor scroll range (starting from 0)
  private topOffset = 0;        // pointer events coordinates are absolute, so we need to offset them
  private height = 0;

  // CDK list
  private listHeight = 0;       // height of CDK list component
  private listTotalHeight = 0;  // total height of all items in virtual list
  private listYRange = 0;       // Y scroll range of the list

  // self native element
  private ne: HTMLDivElement;

  // throttled subject to manage scroll events and show/hide scrollbar
  private scrollSubj = new Subject<void>();
  private _subs!: Subscription;

  // reference to CdkVirtualScrollViewport
  public cvsViewport = input.required<CdkVirtualScrollViewport>({ alias: 'virtualScrollViewport' });
  protected cvsSpacer!: HTMLDivElement;

  // event to notify dragging status
  public isDragging = model<boolean>(false);

  // resize observer to children catch events
  private resizeObserver!: ResizeObserver;
  private cvsViewportScrollSubscription!: Subscription;

  constructor(el: ElementRef<HTMLDivElement>) {
    this.ne = el.nativeElement;
  }

  ngOnInit() {

    // wait 500ms from last scroll event to hide the scrollbar
    this._subs = this.scrollSubj
      .pipe(debounceTime(500))
      .subscribe(() => this.isVisible.set(false));

    // extract vsv child elements
    const viewportNe = this.cvsViewport().elementRef.nativeElement;
    this.cvsSpacer = viewportNe.getElementsByClassName('cdk-virtual-scroll-spacer')?.[0] as HTMLDivElement;

    // start an observer to catch size changes, both in this component and in CDK component
    this.resizeObserver = new ResizeObserver((e, o) => this.resizeHandler(e, o));
    this.resizeObserver.observe(this.ne, { box: 'border-box' });
    this.resizeObserver.observe(this.cvsSpacer, { box: 'border-box' });

    // attach to vsv scroll event
    this.cvsViewportScrollSubscription = this.cvsViewport().elementScrolled().subscribe(e => {
      if (e.target) {
        this.isVisible.set(true);
        this.scrollHandler(e.target as HTMLDivElement);
        this.scrollSubj.next();
      }
    });

  }

  ngOnDestroy() {
    this._subs?.unsubscribe();
    this.cvsViewportScrollSubscription?.unsubscribe();
    this.resizeObserver.disconnect();
  }

  /**
   * Handles CVS element resizes
   */
  private resizeHandler(entries: ResizeObserverEntry[], observer: ResizeObserver) {

    for (const entry of entries) {

      // handle resize of this component
      if (entry.target === this.ne) {
        const r = this.ne.getBoundingClientRect();
        this.height = r.height;
        this.topOffset = r.top;
        this.cursorYRange = this.height - this.cursorHeight;  // cursor can't go outside bottom bound
      }

      // handle resize of CDK spacer DIV
      if (entry.target === this.cvsSpacer) {
        this.listHeight = this.cvsViewport().elementRef.nativeElement.offsetHeight;
        this.listTotalHeight = this.cvsSpacer.offsetHeight;
        this.listYRange = this.listTotalHeight - this.listHeight;
      }

    }

  }


  /**
   * Handles virtual list scroll events and set cursor Y position
   */
  private scrollHandler(elem: HTMLDivElement) {
    if (!this.isDragging()) {
      this.cursorYPos.set(this.clampYPos(this.cursorYRange * elem.scrollTop / this.listYRange));
    }
  }

  /**
   * Set new cursor Y coordinate (relative), clamping value between limits
   */
  setCursorYPos(y: number) {
    // console.log("setCursorYPos", y);
    this.cursorYPos.set(this.clampYPos(y));
  }

  clampYPos(y: number): number {
    if (y < 0) {
      return 0;
    }
    else if (y > this.cursorYRange) {
      return this.cursorYRange;
    }
    return y;
  }

}
