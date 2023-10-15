import { registerPlugin } from '@capacitor/core';

import type { AndroidSAFPlugin, DeleteFileOptions, DirectoryOptions, Encoding, GetFileUriOptions, ReadFileOptions, WriteFileOptions } from './definitions';

const AndroidSAF = registerPlugin<AndroidSAFPlugin>('AndroidSAF', {
  // web: () => import('./web').then(m => new m.AndroidSAFWeb()),
});

export * from './definitions';
export { AndroidSAF };
