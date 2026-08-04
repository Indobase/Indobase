/** Pure helpers for WebContainer boot error classification (safe to unit-test without booting). */

export function isSingletonBootError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /single WebContainer instance/i.test(message);
}

/**
 * A boot failure that retrying cannot fix: the host is missing WEBCONTAINER_API_KEY or is not
 * allowlisted in the StackBlitz console. Only an admin change resolves it, so callers latch on the
 * first one instead of re-running the boot (and its backoff sleeps) for every later action.
 */
export function isFatalBootConfigError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /WEBCONTAINER_API_KEY|API key is not configured|not allowlisted|allowlist this domain|headless 404|rejected this Builder host/i.test(
    message,
  );
}

/**
 * Normalize opaque / timeout boot failures into copy that points founders at server draft preview
 * instead of implying the whole Builder is broken.
 */
export function toUserFacingBootError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : String(error || 'Indobase Builder workspace failed to start.');

  if (/timed out|did not become ready/i.test(message)) {
    if (/server draft/i.test(message)) {
      return message;
    }

    return `${message.replace(/\s+$/, '')} Preview will use the server draft build instead. Click Reset Terminal (↻) to retry WebContainer.`;
  }

  if (isFatalBootConfigError(error)) {
    return message;
  }

  if (/cross-origin isolated|SharedArrayBuffer|Redirect Blocker|strip COOP/i.test(message)) {
    return message;
  }

  return `${message} Preview will use the server draft build when WebContainer is unavailable.`;
}

export function shouldSuggestExtensionDisable(errorMessage: string): boolean {
  if (/API key|allowlist|headless 404|WEBCONTAINER_API_KEY|server draft/i.test(errorMessage)) {
    return false;
  }

  return /Redirect Blocker|cross-origin isolated|Cannot reach the StackBlitz|SharedArrayBuffer|strip COOP|ad-block/i.test(
    errorMessage,
  );
}
