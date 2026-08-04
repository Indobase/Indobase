import { describe, expect, it } from 'vitest';

import { appHref } from '~/components/chat/MyAppsList.client';

describe('appHref', () => {
  it('prefers urlId when present', () => {
    expect(appHref({ id: '1', urlId: 'modern-shop' })).toBe('/chat/modern-shop');
  });

  it('falls back to internal id when urlId is missing', () => {
    expect(appHref({ id: '24' })).toBe('/chat/24');
  });
});
