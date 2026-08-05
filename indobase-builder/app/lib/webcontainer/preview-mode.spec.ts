import { beforeEach, describe, expect, it } from 'vitest';

import { isServerPreviewMode, shouldSkipWebContainerRuntime } from './preview-mode';

describe('preview-mode', () => {
  beforeEach(() => {
    delete (window as any).__INDOBASE_BUILDER_PUBLIC__;
    Object.defineProperty(window, 'location', {
      value: { hostname: 'builder.indobase.in' },
      writable: true,
    });
  });

  it('uses server preview when headless probe reports allowlist missing', () => {
    window.__INDOBASE_BUILDER_PUBLIC__ = {
      webcontainerApiKey: 'wc_api_test',
      webcontainerHeadlessOk: false,
    };

    expect(isServerPreviewMode()).toBe(true);
    expect(shouldSkipWebContainerRuntime()).toBe(true);
  });

  it('keeps WebContainer path when headless probe succeeds', () => {
    window.__INDOBASE_BUILDER_PUBLIC__ = {
      webcontainerApiKey: 'wc_api_test',
      webcontainerHeadlessOk: true,
    };

    expect(isServerPreviewMode()).toBe(false);
    expect(shouldSkipWebContainerRuntime()).toBe(false);
  });

  it('skips WebContainer when boot already failed', () => {
    window.__INDOBASE_BUILDER_PUBLIC__ = {
      webcontainerApiKey: 'wc_api_test',
      webcontainerHeadlessOk: true,
    };

    expect(shouldSkipWebContainerRuntime(true)).toBe(true);
  });

  it('uses WebContainer on localhost even without a key', () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'localhost' },
      writable: true,
    });

    expect(isServerPreviewMode()).toBe(false);
  });

  it('uses server preview on deployed hosts without a key', () => {
    expect(isServerPreviewMode()).toBe(true);
    expect(shouldSkipWebContainerRuntime()).toBe(true);
  });
});
