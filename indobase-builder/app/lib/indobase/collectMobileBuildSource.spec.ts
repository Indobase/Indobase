import { describe, expect, it } from 'vitest';

import { detectExpoProject } from './collectMobileBuildSource';

describe('collectMobileBuildSource', () => {
  it('detects Expo projects from package.json', () => {
    expect(
      detectExpoProject({
        'package.json': JSON.stringify({
          dependencies: { expo: '~52.0.0', react: '18.3.1', 'react-native': '0.76.0' },
        }),
      }),
    ).toBe(true);
  });

  it('rejects plain Vite projects', () => {
    expect(
      detectExpoProject({
        'package.json': JSON.stringify({
          devDependencies: { vite: '^6.0.0' },
        }),
      }),
    ).toBe(false);
  });
});
