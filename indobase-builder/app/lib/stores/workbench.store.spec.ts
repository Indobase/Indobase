import { describe, expect, it } from 'vitest';

import { workbenchStore } from './workbench';

describe('workbenchStore.filesCountAtom', () => {
  it('tracks file entries from the files map', () => {
    workbenchStore.files.set({
      '/home/project/src/App.tsx': { type: 'file', content: 'export {}', isBinary: false },
      '/home/project/src': { type: 'folder' },
    });

    expect(workbenchStore.filesCountAtom.get()).toBe(1);
    expect(workbenchStore.filesCount).toBe(1);

    workbenchStore.files.set({});
    expect(workbenchStore.filesCountAtom.get()).toBe(0);
  });
});
