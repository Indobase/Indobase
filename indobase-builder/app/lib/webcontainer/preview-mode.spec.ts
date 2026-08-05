import { beforeEach, describe, expect, it } from 'vitest';

import { isServerPreviewMode, shouldSkipWebContainerRuntime } from './preview-mode';

describe('preview-mode (sandbox / draft only on deploy)', () => {
  beforeEach(() => {
    delete (window as any).__INDOBASE_BUILDER_PUBLIC__;
    Object.defineProperty(window, 'location', {
      value: { hostname: 'builder.indobase.in' },
      writable: true,
    });
  });

  it('forces server/sandbox mode on deployed hosts even with a WC key', () => {
    window.__INDOBASE_BUILDER_PUBLIC__ = {
      webcontainerApiKey: 'wc_api_test',
      webcontainerHeadlessOk: true,
    };

    expect(isServerPreviewMode()).toBe(true);
    expect(shouldSkipWebContainerRuntime()).toBe(true);
  });

  it('allows WebContainer on localhost', () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'localhost' },
      writable: true,
    });

    expect(isServerPreviewMode()).toBe(false);
    expect(shouldSkipWebContainerRuntime()).toBe(false);
    expect(shouldSkipWebContainerRuntime(true)).toBe(true);
  });
});
