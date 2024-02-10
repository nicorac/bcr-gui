import { registerPlugin } from '@capacitor/core';

import type { BcrGui } from './definitions';

const BcrGui = registerPlugin<BcrGui>('BcrGui', {
  // web: () => import('./web').then(m => new m.AndroidSAFWeb()),
});

export * from './definitions';
export { BcrGui };
