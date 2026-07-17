import { afterEach, describe, expect, it } from 'vitest';

import { resolveStudioServerFetchBase } from './studio-server-url.server';

describe('resolveStudioServerFetchBase', () => {
  const originalInternal = process.env.STUDIO_INTERNAL_URL;

  afterEach(() => {
    if (originalInternal === undefined) {
      delete process.env.STUDIO_INTERNAL_URL;
    } else {
      process.env.STUDIO_INTERNAL_URL = originalInternal;
    }
  });

  it('rejects disallowed public studio origins', () => {
    expect(resolveStudioServerFetchBase('https://evil.example.com')).toBeNull();
  });

  it('uses the public studio origin when no internal override is set', () => {
    delete process.env.STUDIO_INTERNAL_URL;
    expect(resolveStudioServerFetchBase('https://studio.indobase.in/')).toBe(
      'https://studio.indobase.in',
    );
  });

  it('prefers STUDIO_INTERNAL_URL for server-side fetches', () => {
    expect(
      resolveStudioServerFetchBase('https://studio.indobase.in', {
        STUDIO_INTERNAL_URL: 'http://indobase-studio-erpgp1:8080/',
      }),
    ).toBe('http://indobase-studio-erpgp1:8080');
  });
});
