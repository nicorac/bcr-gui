import { registerPlugin } from '@capacitor/core';

import type { AndroidDateTimeSettingsPlugin } from './definitions';

const AndroidDateTimeSettings = registerPlugin<AndroidDateTimeSettingsPlugin>('AndroidDateTimeSettings', {
  // web: () => import('./web').then(m => new m.AndroidSAFWeb()),
});

export * from './definitions';
export { AndroidDateTimeSettings };
