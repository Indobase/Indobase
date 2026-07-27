/** Pure helpers for WebContainer boot error classification (safe to unit-test without booting). */

export function isSingletonBootError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /single WebContainer instance/i.test(message);
}

export function shouldSuggestExtensionDisable(errorMessage: string): boolean {
  return /Redirect Blocker|cross-origin isolated|Cannot reach the StackBlitz|SharedArrayBuffer|strip COOP|ad-block/i.test(
    errorMessage,
  );
}
