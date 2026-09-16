import { RecordingsService } from 'src/app/services/recordings.service';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
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
  ]
})
export class HeaderComponent {

  title = input.required<string>();
  actionButtons = input<ActionButton[]>([]);
  showCustomContent = input(false);

  constructor(
    protected recordingsService: RecordingsService,
  )
  { }

}
