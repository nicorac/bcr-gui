import { Component, ElementRef, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-tags-database',
  templateUrl: './tags-database.component.html',
  styleUrls: ['./tags-database.component.scss'],
})
export class TagsDatabaseComponent  implements OnInit {

  constructor(
    private modalCtrl: ModalController,
    private ref: ElementRef<HTMLElement>,
  ) { }

  ngOnInit(): void {
    this.ref.nativeElement.parentElement?.classList.add('tags-database');
  }

  cancel() {
    return this.modalCtrl.dismiss();
  }

}
