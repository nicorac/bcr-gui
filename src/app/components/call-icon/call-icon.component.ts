import { CallDirection } from 'src/app/models/BcrRecordingMetadata';
import { NgIf } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-call-icon',
  templateUrl: './call-icon.component.html',
  standalone: true,
  imports: [ NgIf ],
})
export class CallIconComponent {

  @Input({ required: true }) direction: CallDirection = '';

}
