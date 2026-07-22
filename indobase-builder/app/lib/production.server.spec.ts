import { describe, expect, it } from 'vitest';

import { isAllowedStudioOrigin } from './production.server';

describe('isAllowedStudioOrigin', () => {
  it('allows production and Hostinger staging Studio hosts', () => {
    expect(isAllowedStudioOrigin('https://studio.indobase.in')).toBe(true);
    expect(isAllowedStudioOrigin('https://studio.indobase.fun')).toBe(true);
  });

  it('rejects unrelated hosts', () => {
    expect(isAllowedStudioOrigin('https://evil.example.com')).toBe(false);
  });
});
