import { describe, expect, it } from 'vitest';

import { getFeatureFlags, markFeatureViewed } from './features';

describe('feature releases', () => {
  it('returns the current Indobase Builder release feed', async () => {
    const features = await getFeatureFlags();

    expect(features.length).toBeGreaterThan(0);
    expect(features[0]).toMatchObject({
      id: 'indobase-builder-launch',
      viewed: false,
    });
  });

  it('accepts known feature ids and rejects unknown ones', async () => {
    await expect(markFeatureViewed('indobase-builder-launch')).resolves.toBeUndefined();
    await expect(markFeatureViewed('does-not-exist')).rejects.toThrow('Unknown feature flag');
  });
});
