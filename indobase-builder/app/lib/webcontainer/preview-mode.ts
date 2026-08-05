import { resolveWebContainerApiKey } from './configure-api-key';
import { getBuilderPublicEnv } from './public-env';

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
 *
 * After a latched boot failure (timeout / StackBlitz outage), callers should also prefer the
 * server draft path — use `hasWebContainerBootFailed()` from `~/lib/webcontainer` for that check
 * (kept out of this module to avoid a circular import with the boot singleton).
 */
export function isServerPreviewMode(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const hostname = window.location.hostname;
  const isLocal =
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.local');

  if (isLocal) {
    return false;
  }

  const { webcontainerHeadlessOk } = getBuilderPublicEnv();

  // Server probe: StackBlitz /headless 404 when the domain is not allowlisted — use draft preview.
  if (webcontainerHeadlessOk === false) {
    return true;
  }

  // No key on a deployed host — WebContainer cannot boot.
  return !resolveWebContainerApiKey();
}

/**
 * Prefer server draft install/dev when WC cannot run (no key) or already failed this session.
 * Pass `bootFailed` from `hasWebContainerBootFailed()` / the boot error atom.
 */
export function shouldSkipWebContainerRuntime(bootFailed = false): boolean {
  return isServerPreviewMode() || bootFailed;
}
