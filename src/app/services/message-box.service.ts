import { Injectable } from '@angular/core';
import { AlertButton, AlertController, AlertInput, IonicSafeString } from '@ionic/angular';

export type MessageType = string|string[]|IonicSafeString;

@Injectable({
  providedIn: 'root'
})
export class MessageBoxService {

  constructor(
    private alertController: AlertController,
  ) { }

  private formatMessage(message?: MessageType): string|IonicSafeString {
    if (Array.isArray(message)) {
      return new IonicSafeString(message.join('<br>'));
    }
    return message ?? '';
  }

  /**
   * Common alert constructor
   */
  private async getAlert(options: {
    header?: string,
    message?: string|IonicSafeString,
    buttons?: (AlertButton | string)[],
    inputs?: AlertInput[],
    cssClass?: string,
  }) {
    return await this.alertController.create({
      // default options
      backdropDismiss: false,
      // given options
      ...options,
    });
  }

  /**
   * Show a simple messagebox with a default "OK" button.
   * Buttons can be customized.
   */
  async show(options: MessageBoxOptions): Promise<void> {

    // merge defaults
    options = { ...new MessageBoxOptions(), ...options };

    const mb = await this.getAlert({
      header: options.header,
      message: this.formatMessage(options.message),
      buttons: options.buttons,
    });
    await mb.present();

  }

  /**
   * Show a confirmation messagebox with customizable buttons
   */
  async showConfirm(options: MessageBoxOptionsConfirm): Promise<void> {

    // merge defaults
    options = { ...new MessageBoxOptionsConfirm(), ...options };

    const mb = await this.getAlert({
      header: options.header,
      message: this.formatMessage(options.message),
      buttons: [
        { text: options.cancelText!, handler: () => options.onCancel?.() },
        { text: options.confirmText!, handler: () => options.onConfirm?.() },
      ],
    });
    await mb.present();

  }

  /**
   * Show an input box
   */
  async showInputBox(options: InputBoxOptions): Promise<AlertInput[]> {

    // merge defaults
    options = { ...new InputBoxOptions(), ...options };

    const mb = await this.getAlert({
      header: options.header,
      message: this.formatMessage(options.message),
      inputs: options.inputs,
      buttons: [
        { text: options.cancelText!, handler: () => options.onCancel?.() },
        { text: options.confirmText!, handler: (data: {}) => options.onConfirm?.(data) },
      ],
    });
    await mb.present();
    return mb.inputs;

  }

  /**
   * Show a generic error alert.
   * Error message is also logget to console.
   */
  async showError(options: MessageBoxOptionsError): Promise<void> {

    // merge defaults
    options = { ...new MessageBoxOptionsError(), ...options };

    // build error message details
    const msgLines = Array.isArray(options.message) ? options.message : [ options.message ];
    msgLines.push('');
    if (options.error?.code) {
      msgLines.push(`Code: ${options.error.code}`);
    }
    if (options.error?.message) {
      msgLines.push(`Error: ${options.error.message}`);
    }

    // log to console
    const msg = msgLines.join('\n').trim();
    console.error(msg);

    // remove leading and trailing empty lines (preserving the ones between message and details)
    const msgHtml = new IonicSafeString(msg.replace(/\n/g, '<br/>'));

    // show alert dialog
    const mb = await this.getAlert({
      cssClass: 'msgbox-error',
      header: options.header ?? 'Error',
      message: msgHtml,
      buttons: [
        { text: options.confirmText ?? 'Ok', handler: () => options.onConfirm?.() },
      ],
    });
    await mb.present();

  }

}

/**
 * Base options for a messagebox
 */
export class mbOptionsBase {
  header?: string = '';
  message?: MessageType = '';
  confirmText?: string = 'Ok';
  onConfirm?: () => void;
}

/**
 * Options for a generic messagebox
 */
export class MessageBoxOptions {
  header: string = '';
  message?: MessageType = '';
  buttons?: AlertButton[] = [ { text: 'Ok' } ];
}

/**
 * Options for an error messagebox
 */
export class MessageBoxOptionsConfirm extends mbOptionsBase {
  cancelText?: string = 'Cancel';
  onCancel?: () => void;
}

/**
 * Options for an error messagebox
 */
export class MessageBoxOptionsError extends mbOptionsBase {
  override header?: string = 'Error';
  error?: any;
}

/**
 * Options for an inputbox
 */
export class InputBoxOptions extends MessageBoxOptions {
  inputs: AlertInput[] = [];
  confirmText?: string = 'Ok';
  onConfirm?: (inputs: any) => void;
  cancelText?: string = 'Cancel';
  onCancel?: () => void;
}
