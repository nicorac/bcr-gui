import { RecordingsService } from 'src/app/services/recordings.service';
import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonicModule } from '@ionic/angular';

export type ActionButton = {
  icon: () => string,
  visible?: () => boolean,
  onClick: () => void,
};

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ AsyncPipe, NgFor, NgIf, IonicModule ]
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
