import { describe, expect, it, beforeEach } from 'vitest';
import {
  isPreviewBusy,
  previewBuilding,
  previewError,
  previewIdle,
  previewManagerState,
  previewPreparing,
  previewReady,
  previewUrlFromManager,
} from './preview-manager';

describe('preview-manager', () => {
  beforeEach(() => {
    previewIdle();
  });

  it('tracks lifecycle transitions', () => {
    previewBuilding({ backend: 'draft' });
    expect(previewManagerState.get().lifecycle).toBe('building');
    expect(isPreviewBusy()).toBe(true);

    previewReady({ previewUrl: 'https://x/draft/', backend: 'draft' });
    expect(previewUrlFromManager()).toBe('https://x/draft/');
    expect(isPreviewBusy()).toBe(false);

    previewError('boom');
    expect(previewManagerState.get().lifecycle).toBe('error');
    expect(previewUrlFromManager()).toBeUndefined();
  });

  it('does not let webcontainer preparing clobber an active draft preview', () => {
    previewReady({ previewUrl: 'https://draft/', backend: 'draft' });
    previewPreparing({ backend: 'webcontainer' });
    previewError('wc failed', 'webcontainer');

    expect(previewManagerState.get().lifecycle).toBe('ready');
    expect(previewManagerState.get().backend).toBe('draft');
    expect(previewUrlFromManager()).toBe('https://draft/');
  });
});
