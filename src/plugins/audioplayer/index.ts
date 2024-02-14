import { registerPlugin } from '@capacitor/core';

import type { AudioPlayer } from './definitions';

const AudioPlayer = registerPlugin<AudioPlayer>('AudioPlayer', {
  // web: () => import('./web').then(m => new m.AndroidSAFWeb()),
});

export * from './definitions';
export { AudioPlayer };
