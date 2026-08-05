import { beforeEach, describe, expect, it } from 'vitest';

import { isServerPreviewMode } from './preview-mode';

describe('preview-mode', () => {
  beforeEach(() => {
    delete (window as any).__INDOBASE_BUILDER_PUBLIC__;
    Object.defineProperty(window, 'location', {
      value: { hostname: 'builder.indobase.in' },
      writable: true,
    });
  });

  it('uses server preview when headless probe reports allowlist missing', async () => {
    window.__INDOBASE_BUILDER_PUBLIC__ = {
      webcontainerApiKey: 'wc_api_test',
      webcontainerHeadlessOk: false,
    };

    expect(isServerPreviewMode()).toBe(true);
  });

  it('keeps WebContainer path when headless probe succeeds', async () => {
    window.__INDOBASE_BUILDER_PUBLIC__ = {
      webcontainerApiKey: 'wc_api_test',
      webcontainerHeadlessOk: true,
    };

    expect(isServerPreviewMode()).toBe(false);
  });
});
