import { describe, expect, it } from 'vitest';

import {
  DEFAULT_STUDIO_URL,
  resolveDefaultStudioUrl,
  resolveStudioUrlFromBuilderHostname,
} from './studio-origin';

describe('resolveStudioUrlFromBuilderHostname', () => {
  it('maps builder.indobase.in to itself (Builder auth)', () => {
    expect(resolveStudioUrlFromBuilderHostname('builder.indobase.in')).toBe('https://builder.indobase.in');
  });

  it('maps builder.indobase.fun to itself', () => {
    expect(resolveStudioUrlFromBuilderHostname('builder.indobase.fun')).toBe('https://builder.indobase.fun');
  });

  it('returns null for localhost and non-builder hosts', () => {
    expect(resolveStudioUrlFromBuilderHostname('localhost')).toBeNull();
    expect(resolveStudioUrlFromBuilderHostname('studio.indobase.in')).toBeNull();
    expect(resolveStudioUrlFromBuilderHostname('')).toBeNull();
  });
});

describe('resolveDefaultStudioUrl', () => {
  it('prefers explicit env over hostname', () => {
    expect(
      resolveDefaultStudioUrl({
        envStudioUrl: 'https://studio.custom.example/',
        hostname: 'builder.indobase.fun',
      }),
    ).toBe('https://studio.custom.example');
  });

  it('uses Builder hostname when env is unset', () => {
    expect(resolveDefaultStudioUrl({ hostname: 'builder.indobase.fun' })).toBe('https://builder.indobase.fun');
  });

  it('falls back to production default', () => {
    expect(resolveDefaultStudioUrl({ hostname: 'localhost' })).toBe(DEFAULT_STUDIO_URL);
  });
});
