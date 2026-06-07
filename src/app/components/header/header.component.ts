import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { IonicBundleModule } from '@src/app/IonicBundle.module';
import { RecordingsService } from '@src/app/services/recordings.service';

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

  protected recordingsService = inject(RecordingsService);

}
