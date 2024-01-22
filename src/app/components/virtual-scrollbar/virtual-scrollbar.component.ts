/* eslint-disable @angular-eslint/no-input-rename */
import { BehaviorSubject, sampleTime, Subject, Subscription } from 'rxjs';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { Component, ElementRef, HostListener, Input, OnDestroy, OnInit, Output } from '@angular/core';

const MIN_CURSOR_HEIGHT = 40; // min cursor height in px

/**
 * This componnt "attaches" itself to a list and shows a virtual scrollbar beside it
 */
@Component({
  selector: 'app-virtual-scrollbar',
  templateUrl: './virtual-scrollbar.component.html',
  styleUrls: ['./virtual-scrollbar.component.scss'],
})
export class VirtualScrollbarComponent implements OnInit, OnDestroy {

  // protected isDragging = false;
  protected readonly cursorHeight = 48;
  protected cursorYPos = 0;     // cursor current Y position
  private cursorYRange = 0;   // Y cursor scroll range (starting from 0)
  private topOffset = 0;      // pointer events coordinates are absolute, so we need to offset them
  private height = 0;

  // CDK list
  private listHeight = 0;       // height of CDK list component
  private listTotalHeight = 0;  // total height of all items in virtual list
  private listYRange = 0;       // Y scroll range of the list

  // self native element
  private ne: HTMLDivElement;

  // throttled subject to manage cursor drag events
  private throttledScrollSubj = new Subject<number>();
  private _subs!: Subscription;

  // reference to CdkVirtualScrollViewport
  @Input({ required: true, alias: 'virtualScrollViewport' })
  cvsViewport!: CdkVirtualScrollViewport;
  cvsSpacer!: HTMLDivElement;

  // event to notify dragging status
  @Output() public isDragging = new BehaviorSubject<boolean>(false);

  // resize observer to children catch events
  private resizeObserver!: ResizeObserver;
  private cvsViewportScrollSubscription!: Subscription;

  constructor(el: ElementRef<HTMLDivElement>) {
    this.ne = el.nativeElement;
  }

  ngOnInit() {

    // limit emission rate of pointerMove DOM event
    this._subs = this.throttledScrollSubj
      .pipe(sampleTime(250))
      .subscribe((yPos: number) => {
        // scroll the CDK virtual list to the given Y coordinate
        this.cvsViewport.scrollToOffset(yPos, 'instant');
      });

    // extract vsv child elements
    const viewportNe = this.cvsViewport.elementRef.nativeElement;
    this.cvsSpacer = viewportNe.getElementsByClassName('cdk-virtual-scroll-spacer')?.[0] as HTMLDivElement;

    // start an observer to catch size changes, both in this component and in CDK component
    this.resizeObserver = new ResizeObserver((e, o) => this.resizeHandler(e, o));
    this.resizeObserver.observe(this.ne, { box: 'border-box' });
    this.resizeObserver.observe(this.cvsSpacer, { box: 'border-box' });

    // attach to vsv scroll event
    this.cvsViewportScrollSubscription = this.cvsViewport.elementScrolled().subscribe(e => {
      if (e.target) {
        this.scrollHandler(e.target as HTMLDivElement);
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
        this.listHeight = this.cvsViewport.elementRef.nativeElement.offsetHeight;
        this.listTotalHeight = this.cvsSpacer.offsetHeight;
        this.listYRange = this.listTotalHeight - this.listHeight;
      }

    }

  }

  /**
   * This is needed to let pointerMove event be continuously raised when moving
   * console.warn(`[touchStart] isDragging: ${this.isDragging}`);
   */
  touchStart(e: TouchEvent) {
    e.preventDefault();
  }

  @HostListener('pointerdown', ['$event'])
  protected pointerDown(e: PointerEvent) {
    this.isDragging.next(true);
    // console.log(`[pointerDown] isDragging: ${this.isDragging}`);
  }

  @HostListener('pointerup', ['$event'])
  protected pointerUp(e: PointerEvent) {
    this.isDragging.next(false);
    // console.log(`[pointerUp] isDragging: ${this.isDragging}`);
  }

  @HostListener('pointermove', ['$event'])
  protected pointerMove(e: PointerEvent) {
    if (this.isDragging.value) {
      this.setCursorYPos(e.clientY - this.topOffset - this.cursorHeight/2);
      // emit event to throttled Subject
      const newY = this.listTotalHeight * this.cursorYPos / this.cursorYRange;
      // console.log(`[pointerMove] newY: ${newY}`);
      this.throttledScrollSubj.next(newY);
    }
  }

  /**
   * Handles virtual list scroll events and set cursor Y position
   */
  private scrollHandler(elem: HTMLDivElement) {
    if (!this.isDragging.value) {
      this.cursorYPos = this.cursorYRange * elem.scrollTop / this.listYRange;
    }
  }

  /**
   * Set new cursor Y coordinate (relative), clamping value between limits
   */
  setCursorYPos(y: number) {
    if (y < 0) {
      y = 0;
    }
    else if (y > this.cursorYRange) {
      y = this.cursorYRange;
    }
    // console.log("setCursorYPos", y);
    this.cursorYPos = y;
  }

}
