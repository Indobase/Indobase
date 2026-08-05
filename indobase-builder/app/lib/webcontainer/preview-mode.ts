/**
 * Preview mode — **self-hosted sandbox / draft only** (no StackBlitz WebContainer for users).
 *
 * Localhost may still boot WebContainer for engineering. Deployed Builder always uses the
 * host-side sandbox (`/sandbox-preview/:id/`) with static draft fallback.
 */

export function isServerPreviewMode(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const hostname = window.location.hostname;
  const isLocal =
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.local');

  // Local engineering may use WebContainer; production/staging never depend on StackBlitz.
  return !isLocal;
}

/** Skip WC install/dev/boot on deployed hosts, or after a latched boot failure on localhost. */
export function shouldSkipWebContainerRuntime(bootFailed = false): boolean {
  return isServerPreviewMode() || bootFailed;
}
