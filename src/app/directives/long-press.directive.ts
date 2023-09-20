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
  private onStartPressHandler = () => this.onStartPress();
  private onEndPressHandler = () => this.onEndPress();

  constructor(
    ref: ElementRef<any>,
  ) {
    this.ne = ref.nativeElement;
  }

  ngOnInit() {
    this.ne.addEventListener('pointerdown', this.onStartPressHandler, { passive: true });
    this.ne.addEventListener('pointerup', this.onEndPressHandler, { passive: true });
    this.ne.addEventListener('pointermove', this.onEndPressHandler, { passive: true });
  }

  ngOnDestroy() {
    this.ne.removeEventListener('pointerdown', this.onStartPressHandler);
    this.ne.removeEventListener('pointerup', this.onEndPressHandler);
    this.ne.removeEventListener('pointermove', this.onEndPressHandler);
  }

  private onStartPress() {
    if (this.holdTimeout) {
      this.onEndPress();
    }
    this.holdTimeout = setTimeout(() => {
      this.onEndPress();
      this.longPress.emit();
    }, this.holdTime);
  }

  private onEndPress() {
    if (this.holdTimeout) {
      clearTimeout(this.holdTimeout);
      this.holdTimeout = undefined;
    }
  }

}
