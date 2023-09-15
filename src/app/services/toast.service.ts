import { Injectable } from '@angular/core';
import { IonicSafeString, ToastController } from '@ionic/angular';

@Injectable({
  providedIn: 'root'
})
export class ToastService {

  constructor(
    private toastController: ToastController,
  ) { }


  /**
   * Show an error toast.
   * Error message is also logged to console.
   */
  async showWarning(options: ToastOptionsBase): Promise<void> {

    // merge defaults
    options = { ...new ToastOptionsBase(), ...options };

    // remove leading and trailing empty lines (preserving the ones between message and details)
    const msgHtml = new IonicSafeString(options.message.replace(/\n/g, '<br/>'));

    // show alert dialog
    const toast = await this.toastController.create({
      cssClass: 'toast',
      message: msgHtml,
      duration: options.duration,
      color: 'dark',
      icon: 'alert-circle-outline',
    });
    await toast.present();

  }

}


/**
 * Base options for toasts
 */
export class ToastOptionsBase {
  // message to show
  message: string = '';
  // toast duration (in ms)
  duration? = 5000;
}