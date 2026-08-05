import { describe, expect, it, vi } from 'vitest';

import { probeWebContainerHeadless, resolveBuilderPublicOrigin } from './headless-probe.server';

describe('headless-probe.server', () => {
  it('resolves builder origin from env before request url', () => {
    expect(resolveBuilderPublicOrigin('http://localhost:5173', { BUILDER_APP_URL: 'https://builder.indobase.in' })).toBe(
      'https://builder.indobase.in',
    );
  });

  it('returns false when headless responds 404', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal('fetch', fetchMock);

    const ok = await probeWebContainerHeadless('wc_api_test', 'https://builder.indobase.in');

    expect(ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('client_id=wc_api_test'),
      expect.objectContaining({
        headers: { Referer: 'https://builder.indobase.in/' },
      }),
    );

    vi.unstubAllGlobals();
  });

  it('returns true when headless responds ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(probeWebContainerHeadless('wc_api_test', 'https://localhost:5173')).resolves.toBe(true);

    vi.unstubAllGlobals();
  });
});
