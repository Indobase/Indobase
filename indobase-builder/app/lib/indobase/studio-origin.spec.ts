import { describe, expect, it } from 'vitest';

import {
  DEFAULT_STUDIO_URL,
  resolveDefaultStudioUrl,
  resolveStudioUrlFromBuilderHostname,
} from './studio-origin';

describe('resolveStudioUrlFromBuilderHostname', () => {
  it('maps builder.indobase.in to studio.indobase.in', () => {
    expect(resolveStudioUrlFromBuilderHostname('builder.indobase.in')).toBe('https://studio.indobase.in');
  });

  it('maps builder.indobase.fun to studio.indobase.fun', () => {
    expect(resolveStudioUrlFromBuilderHostname('builder.indobase.fun')).toBe('https://studio.indobase.fun');
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

  it('uses hostname sibling when env is unset', () => {
    expect(resolveDefaultStudioUrl({ hostname: 'builder.indobase.fun' })).toBe('https://studio.indobase.fun');
  });

  it('falls back to production default', () => {
    expect(resolveDefaultStudioUrl({ hostname: 'localhost' })).toBe(DEFAULT_STUDIO_URL);
  });
});
