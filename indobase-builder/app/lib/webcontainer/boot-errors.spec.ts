import { describe, expect, it } from 'vitest';
import {
  isExpectedWebContainerFallbackError,
  isFatalBootConfigError,
  isSingletonBootError,
  shouldSuggestExtensionDisable,
  toUserFacingBootError,
} from './boot-errors';
import { shouldSkipWebContainerRuntime } from './preview-mode';

describe('webcontainer boot helpers', () => {
  it('detects the StackBlitz singleton boot error', () => {
    expect(isSingletonBootError(new Error('Only a single WebContainer instance can be booted'))).toBe(true);
    expect(isSingletonBootError(new Error('Indobase Builder workspace failed to start (timed out).'))).toBe(false);
  });

  it('classifies missing-key / allowlist failures as fatal config errors', () => {
    expect(isFatalBootConfigError(new Error('WebContainer API key is not configured for this host'))).toBe(true);
    expect(isFatalBootConfigError(new Error('StackBlitz rejected this Builder host (404)'))).toBe(true);
    expect(isFatalBootConfigError(new Error('Indobase Builder workspace failed to start (timed out).'))).toBe(false);
  });

  it('points timeout failures at server draft preview', () => {
    const message = toUserFacingBootError(
      new Error('WebContainer did not become ready in time. Click Reset Terminal or hard-refresh (Chrome/Edge).'),
    );
    expect(message).toMatch(/server draft/i);
    expect(message).toMatch(/Reset Terminal/);
  });

  it('does not duplicate draft guidance when already present', () => {
    const original =
      'Indobase Builder workspace failed to start (timed out). Preview will use the server draft build instead.';
    expect(toUserFacingBootError(new Error(original))).toBe(original);
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
    expect(
      shouldSuggestExtensionDisable(
        'Preview will use the server draft build instead. Click Reset Terminal (↻) to retry WebContainer.',
      ),
    ).toBe(false);
  });

  it('skips WebContainer runtime when boot already failed', () => {
    expect(shouldSkipWebContainerRuntime(true)).toBe(true);
  });

  it('classifies expected WC timeout → draft-preview soft failures', () => {
    expect(
      isExpectedWebContainerFallbackError(
        new Error(
          'Indobase Builder workspace failed to start (timed out). Preview will use the server draft build instead. Click Reset Terminal (↻) to retry WebContainer, or hard-refresh (Chrome/Edge).',
        ),
      ),
    ).toBe(true);
    expect(isExpectedWebContainerFallbackError(new Error('Only a single WebContainer instance can be booted'))).toBe(
      false,
    );
  });
});
