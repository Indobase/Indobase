import { describe, expect, it } from 'vitest';
import { isSingletonBootError, shouldSuggestExtensionDisable } from './boot-errors';

describe('webcontainer boot helpers', () => {
  it('detects the StackBlitz singleton boot error', () => {
    expect(isSingletonBootError(new Error('Only a single WebContainer instance can be booted'))).toBe(true);
    expect(isSingletonBootError(new Error('Indobase Builder workspace failed to start (timed out).'))).toBe(false);
  });

  it('gates extension advice to COOP / StackBlitz reachability failures', () => {
    expect(
      shouldSuggestExtensionDisable(
        'Cannot reach the StackBlitz WebContainer runtime. Disable Redirect Blocker / ad-block extensions',
      ),
    ).toBe(true);
    expect(
      shouldSuggestExtensionDisable(
        'This browser tab is not cross-origin isolated (SharedArrayBuffer unavailable).',
      ),
    ).toBe(true);
    expect(
      shouldSuggestExtensionDisable(
        'Indobase Builder workspace is already running in this tab, but the handle was lost.',
      ),
    ).toBe(false);
    expect(shouldSuggestExtensionDisable('Only a single WebContainer instance can be booted')).toBe(false);
  });
});
