import { sampleTime, Subject, Subscription } from 'rxjs';
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { IonList } from '@ionic/angular';

/**
 * This componnt "attaches" itself to a list and shows a virtual scrollbar beside it
 */
@Component({
  selector: 'app-virtual-scrollbar',
  templateUrl: './virtual-scrollbar.component.html',
  styleUrls: ['./virtual-scrollbar.component.scss'],
})
export class VirtualScrollbarComponent implements OnInit, AfterViewInit, OnDestroy {

  protected isDragging = false;
  protected lastSetIndex = 0;
  protected topOffset = 0;    // pointer events coordinates are absolute, so we need to offset them
  protected scrollRange = 0;  // scroll range of the cursor (relative in Y coordinate, starting from 0)
  protected cursorYPos = 0;   // cursor current Y position
  protected cursorHeight = 48;
  protected cursorDragging = false;

  // reference list
  @Input({ required: true }) list!: IonList;
  listBounds = new DOMRect();

  // cursor element
  @ViewChild('cursor') cursor!: ElementRef<HTMLDivElement>;

  // cursor position
  @Input() min = 0;
  @Input() max = 100;
  @Input() set value(val: number) {
    // console.warn(`[setValue] newIndex: ${val}`);
    if (!this.isDragging) {
      const ratio = val / (this.max - this.min);
      this.setCursorYPos(this.scrollRange * ratio);
    }
  };
  private limitedSubj = new Subject<number>();
  private limiterSubjSub?: Subscription;
  @Output() valueChange = new EventEmitter<number>();


  constructor() { }

  ngOnInit() {
    // limit emission rate of pointerMove DOM event
    this.limiterSubjSub = this.limitedSubj
      .pipe(sampleTime(300))
      .subscribe((index: number) => {
        // console.warn(`[emit] newIndex: ${index}`);
        this.valueChange.emit(index)
      });
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.listBounds = (this.list as any).el.getBoundingClientRect();
      this.topOffset = this.listBounds.top;
      this.scrollRange = this.listBounds.height - this.cursorHeight;  // cursor can't go outside bottom bound
    }, 1000);
  }

  ngOnDestroy() {
    this.limiterSubjSub?.unsubscribe();
  }

  touchStart(e: TouchEvent) {
    // needed to let pointerMove event be continuously raised when moving
    // console.warn(`[touchStart] isDragging: ${this.isDragging}`);
    e.preventDefault();
  }

  pointerDown(e: PointerEvent) {
    this.isDragging = true;
    // console.warn(`[pointerDown] isDragging: ${this.isDragging}`);
  }

  protected pointerUp(e: PointerEvent) {
    this.isDragging = false;
    // console.warn(`[pointerUp] isDragging: ${this.isDragging}`);
  }

  protected pointerMove(e: PointerEvent) {
    // e.preventDefault();
    if (this.isDragging) {
      const newY = e.clientY - this.topOffset - this.cursorHeight / 2;
      this.setCursorYPos(e.clientY - this.topOffset - this.cursorHeight / 2);
      // emit event to limitedSubject
      this.lastSetIndex = Math.floor((this.max - this.min) * this.cursorYPos / this.scrollRange);
      this.limitedSubj.next(this.lastSetIndex);
      // console.warn(`[pointerMove] newIndex: ${this.lastSetIndex}`);
      // this.valueChange.next(this.lastSetIndex);
    }
  }

  /**
   *
   * @param y set new cursor Y coordinate (relative), clamping value between limits
   */
  setCursorYPos(y: number) {
    // console.log("MOVE", e.clientY, newY, this.cursorBottom);
    if (y < 0) {
      y = 0;
    }
    else if (y > this.scrollRange) {
      y = this.scrollRange;
    }
    this.cursorYPos = y;
  }

}
