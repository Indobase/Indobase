import { describe, expect, it, vi } from 'vitest';
import { yieldAfterBatch, yieldToMain } from './yieldToMain';

describe('yieldToMain', () => {
  it('resolves via MessageChannel when available', async () => {
    await expect(yieldToMain()).resolves.toBeUndefined();
  });

  it('falls back to setTimeout when MessageChannel is missing', async () => {
    const original = globalThis.MessageChannel;
    // @ts-expect-error intentional stub
    globalThis.MessageChannel = undefined;

    try {
      const spy = vi.spyOn(globalThis, 'setTimeout');
      const pending = yieldToMain();
      expect(spy).toHaveBeenCalled();
      await expect(pending).resolves.toBeUndefined();
      spy.mockRestore();
    } finally {
      globalThis.MessageChannel = original;
    }
  });
});

describe('yieldAfterBatch', () => {
  it('skips yield off batch boundaries', async () => {
    await expect(yieldAfterBatch(1, 4)).resolves.toBeUndefined();
    await expect(yieldAfterBatch(3, 4)).resolves.toBeUndefined();
    await expect(yieldAfterBatch(0, 4)).resolves.toBeUndefined();
    await expect(yieldAfterBatch(4, 0)).resolves.toBeUndefined();
  });

  it('yields on batch boundaries', async () => {
    await expect(yieldAfterBatch(4, 4)).resolves.toBeUndefined();
    await expect(yieldAfterBatch(8, 4)).resolves.toBeUndefined();
  });
});
