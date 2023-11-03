import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { FilenamePatternEditorComponent } from './filename-pattern-editor.component';

describe('FilenameFormatEditorComponent', () => {
  let component: FilenamePatternEditorComponent;
  let fixture: ComponentFixture<FilenamePatternEditorComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ FilenamePatternEditorComponent ],
      imports: [IonicModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(FilenamePatternEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
