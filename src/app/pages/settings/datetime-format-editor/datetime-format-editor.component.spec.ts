import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { DatetimeFormatEditorComponent } from './datetime-format-editor.component';

describe('DatetimeFormatEditorComponent', () => {
  let component: DatetimeFormatEditorComponent;
  let fixture: ComponentFixture<DatetimeFormatEditorComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ DatetimeFormatEditorComponent ],
      imports: [IonicModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(DatetimeFormatEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
