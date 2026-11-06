import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CallDirection } from '@app/models/BcrRecordingMetadata';

@Component({
  selector: 'app-call-icon',
  templateUrl: './call-icon.component.html',
  styleUrl: './call-icon.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CallIconComponent {

  public direction = input.required<CallDirection>();

}
