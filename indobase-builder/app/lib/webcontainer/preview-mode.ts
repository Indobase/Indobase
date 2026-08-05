/**
 * Builder preview mode — **draft preview only**.
 *
 * WebContainer / StackBlitz is disabled product-wide. Generated apps are built on the
 * Builder server and shown at `/draft-preview/:id/`. Users never need a StackBlitz API key.
 *
 * Kept as functions (not constants) so existing call sites stay stable.
 */

/** Always true — in-browser WebContainer is not used. */
export function isServerPreviewMode(): boolean {
  return true;
}

/** Always skip WebContainer install/dev/boot. */
export function shouldSkipWebContainerRuntime(_bootFailed = false): boolean {
  return true;
}
