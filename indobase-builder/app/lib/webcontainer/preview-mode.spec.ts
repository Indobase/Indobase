import { beforeEach, describe, expect, it } from 'vitest';

import { isServerPreviewMode, shouldSkipWebContainerRuntime } from './preview-mode';

describe('preview-mode (draft-only)', () => {
  beforeEach(() => {
    delete (window as any).__INDOBASE_BUILDER_PUBLIC__;
    Object.defineProperty(window, 'location', {
      value: { hostname: 'builder.indobase.in' },
      writable: true,
    });
  });

  it('always uses server draft preview', () => {
    window.__INDOBASE_BUILDER_PUBLIC__ = {
      webcontainerApiKey: 'wc_api_test',
      webcontainerHeadlessOk: true,
    };

    expect(isServerPreviewMode()).toBe(true);
    expect(shouldSkipWebContainerRuntime()).toBe(true);
    expect(shouldSkipWebContainerRuntime(false)).toBe(true);
  });

  it('stays draft-only on localhost too', () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'localhost' },
      writable: true,
    });

    expect(isServerPreviewMode()).toBe(true);
  });
});
