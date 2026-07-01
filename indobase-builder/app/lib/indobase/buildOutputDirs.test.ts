import { describe, expect, it } from 'vitest';

import { ensureIndexHtmlInArtifacts, findFirstExistingBuildOutputDir } from './buildOutputDirs';

describe('buildOutputDirs', () => {
  it('findFirstExistingBuildOutputDir prefers the first match', async () => {
    const existing = new Set(['build', 'dist']);

    const dir = await findFirstExistingBuildOutputDir(async (candidate) => existing.has(candidate));

    expect(dir).toBe('dist');
  });

  it('ensureIndexHtmlInArtifacts copies login.html when index.html is missing', async () => {
    const files = await ensureIndexHtmlInArtifacts({ 'login.html': '<html>login</html>' }, async () => null);

    expect(files['index.html']).toBe('<html>login</html>');
  });
});
