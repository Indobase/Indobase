import { beforeEach, describe, expect, it, vi } from 'vitest';

const configureAPIKey = vi.hoisted(() => vi.fn());

vi.mock('@webcontainer/api', () => ({
  configureAPIKey,
}));

describe('ensureWebContainerApiKeyConfigured', () => {
  beforeEach(() => {
    configureAPIKey.mockClear();
    delete (window as any).__INDOBASE_BUILDER_PUBLIC__;
    vi.resetModules();
  });

  it('configures the StackBlitz client key from window public env', async () => {
    window.__INDOBASE_BUILDER_PUBLIC__ = { webcontainerApiKey: 'wc_api_test_key' };
    const { ensureWebContainerApiKeyConfigured } = await import('./configure-api-key');

    ensureWebContainerApiKeyConfigured();

    expect(configureAPIKey).toHaveBeenCalledWith('wc_api_test_key');
  });

  it('throws on production hosts when the key is missing', async () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'builder.indobase.in' },
      writable: true,
    });

    const { ensureWebContainerApiKeyConfigured } = await import('./configure-api-key');

    expect(() => ensureWebContainerApiKeyConfigured()).toThrow(/WEBCONTAINER_API_KEY/);
    expect(configureAPIKey).not.toHaveBeenCalled();
  });
});

describe('builder public env bootstrap', () => {
  beforeEach(() => {
    delete (window as any).__INDOBASE_BUILDER_PUBLIC__;
    vi.resetModules();
  });

  it('applyBuilderPublicEnv stores the key and unblocks whenBuilderPublicEnvReady', async () => {
    const { applyBuilderPublicEnv, whenBuilderPublicEnvReady } = await import('./public-env');

    applyBuilderPublicEnv({ webcontainerApiKey: 'wc_api_from_bootstrap' });

    await expect(whenBuilderPublicEnvReady(100)).resolves.toBeUndefined();
    expect(window.__INDOBASE_BUILDER_PUBLIC__?.webcontainerApiKey).toBe('wc_api_from_bootstrap');
  });
});
