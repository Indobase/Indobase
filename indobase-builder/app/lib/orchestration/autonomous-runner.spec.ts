import { describe, expect, it } from 'vitest';
import { resolveTestCommand } from './autonomous-runner';

describe('resolveTestCommand', () => {
  it('returns npm test when a real test script exists', () => {
    expect(
      resolveTestCommand({
        scripts: { test: 'vitest run' },
      }),
    ).toBe('export CI=true && npm run test -- --run --watch=false --watchAll=false --passWithNoTests');
  });

  it('skips placeholder test scripts', () => {
    expect(
      resolveTestCommand({
        scripts: { test: 'echo "Error: no test specified" && exit 1' },
      }),
    ).toBeNull();
  });

  it('prefers test:ci when present', () => {
    expect(
      resolveTestCommand({
        scripts: { test: 'echo "Error: no test specified" && exit 1', 'test:ci': 'vitest run' },
      }),
    ).toBe('export CI=true && npm run test:ci');
  });

  it('uses non-watch flags for test:unit', () => {
    expect(
      resolveTestCommand({
        scripts: { 'test:unit': 'vitest' },
      }),
    ).toBe('export CI=true && npm run test:unit -- --run --watch=false --watchAll=false --passWithNoTests');
  });
});