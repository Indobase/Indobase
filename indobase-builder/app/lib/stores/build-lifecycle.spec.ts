import { beforeEach, describe, expect, it } from 'vitest';
import {
  beginInitialBuild,
  buildRecommendationsReady,
  failInitialBuild,
  initialBuildLifecycle,
} from './build-lifecycle';

describe('initial build lifecycle', () => {
  beforeEach(() => {
    initialBuildLifecycle.set('idle');
  });

  it('keeps recommendations hidden until preview success', () => {
    beginInitialBuild();
    expect(buildRecommendationsReady.get()).toBe(false);

    initialBuildLifecycle.set('finalizing');
    expect(buildRecommendationsReady.get()).toBe(false);

    initialBuildLifecycle.set('preview-ready');
    expect(buildRecommendationsReady.get()).toBe(true);
  });

  it('keeps recommendations hidden after a failed initial build', () => {
    beginInitialBuild();
    failInitialBuild();

    expect(initialBuildLifecycle.get()).toBe('failed');
    expect(buildRecommendationsReady.get()).toBe(false);
  });
});
