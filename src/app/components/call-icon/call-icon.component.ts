import { CallDirection } from 'src/app/models/BcrRecordingMetadata';
import { NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-call-icon',
  templateUrl: './call-icon.component.html',
  styleUrl: './call-icon.component.scss',
  standalone: true,
  imports: [ NgIf ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CallIconComponent {

  public direction = input.required<CallDirection>();

}
