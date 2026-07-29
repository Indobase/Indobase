import { resolveWebContainerApiKey } from './configure-api-key';

/**
 * Builder has two ways to show a running app:
 *
 *  - WebContainer: an in-browser Node runtime. Instant, gives a live dev server and a terminal,
 *    but StackBlitz only serves it on localhost or on a host with an API key + allowlisted domain.
 *  - Server preview: build the generated project on the Builder server (`npm install && npm run
 *    build`) and host the static output under /draft-preview/:id/. No key, no browser runtime.
 *
 * When no key is configured on a deployed host, WebContainer can never boot — so rather than
 * booting, failing, and recovering from the error, treat server preview as the intended mode and
 * go straight to it.
 */
export function isServerPreviewMode(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const hostname = window.location.hostname;
  const isLocal =
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.local');

  // Localhost boots WebContainer keylessly, so it keeps the richer path.
  return !isLocal && !resolveWebContainerApiKey();
}
