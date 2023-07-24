import { ToHmsPipe } from './to-hms.pipe';

describe('ToHmsPipe', () => {
  it('create an instance', () => {
    const pipe = new ToHmsPipe();
    expect(pipe).toBeTruthy();
  });
});
