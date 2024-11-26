import { ErrorHandler, Injectable } from '@angular/core';
import { MessageBoxService } from '../services/message-box.service';

@Injectable()
export class CustomErrorHandler implements ErrorHandler {

  private lastMessage = '';
  private lastStack = '';

  constructor(
    private mbs: MessageBoxService,
  ) {
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError(event.reason);
    });
  }

  handleError(error: any) {

    // extract error data
    let message = error?.message ? error.message : error.toString();
    let stack = error?.stack ? error.stack : '';

    // avoid repeated errors (i.e. template errors in a @for loop)
    if (this.lastMessage === message && this.lastStack === stack) {
      return;
    }
    this.lastMessage = message;
    this.lastStack = stack;

    // error is logged to console, as usual
    console.error(error);

    this.mbs.showError({
      error: message,
      message: stack,
      onConfirm: () => {
        // reset last error
        this.lastMessage = '';
        this.lastStack = '';
      }
    });
  }
}