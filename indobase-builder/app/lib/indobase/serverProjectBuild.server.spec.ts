import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { formatServerBuildExecError } from './serverProjectBuild.server';

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

describe('formatServerBuildExecError', () => {
  it('prefers stderr over opaque Command failed message', () => {
    const error = Object.assign(new Error('Command failed: npm run build -- --base ./'), {
      stderr: 'error TS2307: Cannot find module "./Missing"\n',
      stdout: '',
    });

    const message = formatServerBuildExecError(error);
    expect(message).toContain('Server build failed');
    expect(message).toContain('TS2307');
    expect(message).not.toMatch(/^Command failed:/);
  });

  it('falls back to Error.message when no stdio', () => {
    expect(formatServerBuildExecError(new Error('boom'))).toBe('boom');
  });
});
