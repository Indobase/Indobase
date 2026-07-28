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
    expect(
      shouldSuggestExtensionDisable(
        'Indobase Builder workspace failed to start (timed out). Hard-refresh the page (Chrome or Edge) or click the terminal reset button (↻) to retry.',
      ),
    ).toBe(false);
    expect(
      shouldSuggestExtensionDisable(
        'WebContainer API key is not configured for this host. Set WEBCONTAINER_API_KEY on the Builder service',
      ),
    ).toBe(false);
    expect(
      shouldSuggestExtensionDisable(
        'StackBlitz rejected this Builder host (headless 404). In the StackBlitz API Console, enable the WebContainer API key',
      ),
    ).toBe(false);
  });
});
