/* eslint-disable @angular-eslint/directive-selector */
/* eslint-disable @angular-eslint/no-output-on-prefix */
import { Directive, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';

/**
 * HOW TO USE
 *
 * <div longPress [holdTime]="1000" (longPress)="holdHandler()"></div>
 */
@Directive({
  selector: '[longPress]',
  standalone: true
})
export class LongPressDirective implements OnInit, OnDestroy {

  @Input() holdTime: number = 500;
  @Output() longPress: EventEmitter<void> = new EventEmitter();

  private ne!: HTMLElement;
  private holdTimeout?: ReturnType<typeof setTimeout>;
  private onStartPressHandler = (ev: PointerEvent) => this.onStartPress();
  private onEndPressHandler = (ev: PointerEvent) => this.onEndPress();
  private onMoveHandler = (ev: PointerEvent) => {
    // discard first "fake" move event raised just after "press" on some devices
    if (!(ev.movementX || ev.movementY)) {
      return;
    }
    this.onEndPress();
  }

  constructor(
    ref: ElementRef<any>,
  ) {
    this.ne = ref.nativeElement;
  }

  ngOnInit() {
    this.ne.addEventListener('pointerdown', this.onStartPressHandler, { passive: true });
    this.ne.addEventListener('pointerup', this.onEndPressHandler, { passive: true });
    this.ne.addEventListener('pointermove', this.onMoveHandler, { passive: true });
  }

  ngOnDestroy() {
    this.ne.removeEventListener('pointerdown', this.onStartPressHandler);
    this.ne.removeEventListener('pointerup', this.onEndPressHandler);
    this.ne.removeEventListener('pointermove', this.onMoveHandler);
  }

  private onStartPress() {
    console.warn('Start press');
    if (this.holdTimeout) {
      this.onEndPress();
    }
    console.warn('Start timeout');
    this.holdTimeout = setTimeout(() => {
      console.warn('Timeout handler');
      this.onEndPress();
      this.longPress.emit();
    }, this.holdTime);
  }

  private onEndPress() {
    console.warn('End press');
    if (this.holdTimeout) {
      clearTimeout(this.holdTimeout);
      this.holdTimeout = undefined;
    }
  }

}
