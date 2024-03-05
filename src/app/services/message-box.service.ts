import { Injectable } from '@angular/core';
import { Clipboard } from '@capacitor/clipboard';
import { AlertButton, AlertController, AlertInput, IonicSafeString } from '@ionic/angular';
import { I18nKey, I18nService, TranslationArgs } from './i18n.service';

export type MessageType = string|string[]|IonicSafeString;

@Injectable({
  providedIn: 'root'
})
export class MessageBoxService {

  constructor(
    private alertController: AlertController,
    private i18n: I18nService,
  ) { }

  private formatMessage(message?: MessageType): string|IonicSafeString {
    if (Array.isArray(message)) {
      return new IonicSafeString(message.join('<br>'));
    }
    else if (typeof message === 'string' && message.includes('\n')) {
      return new IonicSafeString(message.replaceAll('\n', '<br/>'));
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

    // prepend custom class (if not already there)
    const classes = options.cssClass?.split(' ') ?? [];
    if (!classes.includes('msgbox')) {
      classes.unshift('msgbox');
    }
    options.cssClass = classes.join(' ');

    return await this.alertController.create({
      // given options
      ...options,
    });
  }

  // /**
  //  * Show a simple messagebox with a default "OK" button.
  //  * Buttons can be customized.
  //  */
  // async show(options: MessageBoxOptions): Promise<void> {

  //   // merge defaults
  //   options = { ...new MessageBoxOptions(), ...options };

  //   const mb = await this.getAlert({
  //     header: options.header,
  //     message: this.formatMessage(options.message),
  //     buttons: options.buttons,
  //   });
  //   await mb.present();

  // }

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
        { text: options.cancelText ?? this.i18n.get('LBL_CANCEL'), handler: () => options.onCancel?.() },
        { text: options.confirmText ?? this.i18n.get('LBL_OK'), handler: () => options.onConfirm?.() },
      ],
      cssClass: 'msgbox-confirm',
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
   * Error message is also logged to the console.
   */
  async showError(options: MessageBoxOptionsError): Promise<void> {

    // merge defaults
    options = { ...new MessageBoxOptionsError(), ...options };

    // build error message details
    const msgLines = [];

    // application error code
    if (options.appErrorCode) {
      msgLines.push(`${options.appErrorCode}: ` + this.i18n.get(options.appErrorCode, options.appErrorArgs));
    }

    // additional message
    if (Array.isArray(options.message)) {
      msgLines.push(...options.message);
    }
    else if (options.message) {
      msgLines.push(options.message);
    }

    // javascript exception
    if (options.error) {
      msgLines.push('');
      if (options.error?.code) {
        msgLines.push(`Code: ${options.error.code}`);
      }
      if (options.error?.message) {
        msgLines.push(`Error: ${options.error.message}`);
      }
    }

    // remove leading and trailing empty lines (preserving the ones between message and details)
    const msg = msgLines.join('\n').trim();
    console.error(msg);

    // log to console
    const msgHtml = new IonicSafeString(msg.replace(/\n/g, '<br/>'));

    // show alert dialog
    const mb = await this.getAlert({
      cssClass: 'msgbox-error',
      header: options.header ?? this.i18n.get('LBL_ERROR'),
      message: msgHtml,
      buttons: [
        {
          text: this.i18n.get('LBL_COPY'),
          handler: () => Clipboard.write({ string: msg }),
        },
        {
          text: options.confirmText ?? this.i18n.get('LBL_OK'),
          handler: () => options.onConfirm?.(),
        },
      ],
    });
    await mb.present();

  }

}

/**
 * Base options for a messagebox
 */
export class mbOptionsBase {
  header?: string;
  message?: MessageType = '';
  confirmText?: string = 'Ok';
  onConfirm?: () => void;
}

/**
 * Options for an error messagebox
 */
export class MessageBoxOptions {
  header?: string;
  message?: MessageType = '';
  buttons?: AlertButton[] = [ { text: 'Ok' } ];
}

/**
 * Options for an error messagebox
 */
export class MessageBoxOptionsConfirm extends mbOptionsBase {
  cancelText?: string;
  onCancel?: () => void;
}

/**
 * Options for an inputbox
 */
export class MessageBoxOptionsError extends mbOptionsBase {
  appErrorCode?: I18nKey;
  appErrorArgs?: TranslationArgs;
  error?: any;  // JavaScript original error
}

/**
 * Options for an inputbox
 */
export class InputBoxOptions extends MessageBoxOptions {
  inputs: AlertInput[] = [];
  confirmText?: string = 'Ok';
  onConfirm?: (inputs: any) => void;
  cancelText?: string;
  onCancel?: () => void;
}
