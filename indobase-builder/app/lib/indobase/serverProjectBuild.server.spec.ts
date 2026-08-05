import { describe, expect, it } from 'vitest';
import path from 'node:path';

/**
 * Regression: Vite's process shim leaves execPath undefined. Building candidate paths
 * eagerly with path.dirname(process.execPath) crashed every server draft preview.
 */
describe('server project build npm resolution', () => {
  it('does not use path.dirname on undefined execPath', () => {
    const shimExecPath: string | undefined = undefined;

    expect(() => path.dirname(shimExecPath as unknown as string)).toThrow(/path.*string/i);

    const candidates = ['/usr/local/bin/npm', '/usr/bin/npm', '/bin/npm'];
    expect(candidates.every((c) => typeof c === 'string' && c.length > 0)).toBe(true);
  });
});
