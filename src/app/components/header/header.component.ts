import { IonicBundleModule } from 'src/app/IonicBundle.module';
import { RecordingsService } from 'src/app/services/recordings.service';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

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
  imports: [ IonicBundleModule ]
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
