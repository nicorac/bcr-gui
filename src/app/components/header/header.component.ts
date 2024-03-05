import { RecordingsService } from 'src/app/services/recordings.service';
import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
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
  imports: [ AsyncPipe, NgFor, NgIf, IonicModule ]
})
export class HeaderComponent {

  @Input({ required: true }) title!: string;
  @Input() actionButtons?: ActionButton[];
  @Input() showCustomContent = false;

  constructor(
    private readonly route: ActivatedRoute,
    protected recordingsService: RecordingsService,
  )
  { }

}
