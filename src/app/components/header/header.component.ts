import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RecordingsService } from '@app/services/recordings.service';
import { IonButton, IonButtons, IonHeader, IonIcon, IonMenuButton, IonProgressBar, IonTitle, IonToolbar } from '@ionic/angular';

export type ActionButton = {
  icon: () => string,
  visible?: () => boolean,
  onClick: () => void,
};

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonButton,
    IonButtons,
    IonHeader,
    IonIcon,
    IonMenuButton,
    IonTitle,
    IonToolbar,
    IonProgressBar,
  ],
  providers: [
    RecordingsService,
  ]
})
export class HeaderComponent {

  title = input.required<string>();
  actionButtons = input<ActionButton[]>([]);
  showCustomContent = input(false);

  protected recordingsService = inject(RecordingsService);

}
