import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { VirtualScrollbarComponent } from './VirtualScrollbarComponent';

describe('VirtualScrollbarComponent', () => {
  let component: VirtualScrollbarComponent;
  let fixture: ComponentFixture<VirtualScrollbarComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ VirtualScrollbarComponent ],
      imports: [IonicModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(VirtualScrollbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
