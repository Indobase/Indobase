import { describe, expect, it } from 'vitest';
import { createPocketBaseAppId, physicalCollectionName } from './managed.server';

describe('managed PocketBase naming', () => {
  it('creates short alphanumeric app ids', () => {
    expect(createPocketBaseAppId('Chat-ABC_123')).toMatch(/^[a-z0-9]+$/);
    expect(createPocketBaseAppId('Chat-ABC_123').length).toBeLessThanOrEqual(10);
  });

  it('scopes collection names by app id', () => {
    expect(physicalCollectionName('abc123', 'Posts')).toBe('ib_abc123_posts');
  });
});
