import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  isBrowserExtensionNoise,
  isStaleChunkLoadError,
  reloadOnceForStaleChunk,
  resetStaleChunkReloadLatchForTests,
} from './client-noise';

describe('client-noise', () => {
  beforeEach(() => {
    resetStaleChunkReloadLatchForTests();
  });

  it('detects stale hashed chunk load failures after deploy', () => {
    expect(
      isStaleChunkLoadError(
        new TypeError('Failed to fetch dynamically imported module: https://builder.indobase.in/assets/index-0mZ9xS9o.js'),
      ),
    ).toBe(true);
    expect(isStaleChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isStaleChunkLoadError(new Error('Network offline'))).toBe(false);
  });

  it('detects browser extension noise', () => {
    expect(isBrowserExtensionNoise(new Error('ObjectMultiplex - disconnected'))).toBe(true);
    expect(isBrowserExtensionNoise(new Error('contentscript.js failed'))).toBe(true);
    expect(isBrowserExtensionNoise(new Error('Chat stream failed'))).toBe(false);
  });

  it('reloads only once for stale chunks', () => {
    const storage = new Map<string, string>();
    const api = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    };
    const reload = vi.fn();

    expect(reloadOnceForStaleChunk(api, reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reloadOnceForStaleChunk(api, reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
