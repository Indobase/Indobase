import { describe, expect, it } from 'vitest';
import { isOpenRouterRateLimitError } from './openrouter-stream-fallback';

describe('isOpenRouterRateLimitError', () => {
  it('detects HTTP 429 status codes', () => {
    expect(isOpenRouterRateLimitError({ statusCode: 429, message: 'Too Many Requests' })).toBe(true);
  });

  it('detects rate-limit phrasing in messages', () => {
    expect(isOpenRouterRateLimitError({ message: 'Provider returned Too Many Requests' })).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isOpenRouterRateLimitError({ statusCode: 500, message: 'Internal Server Error' })).toBe(false);
  });
});
