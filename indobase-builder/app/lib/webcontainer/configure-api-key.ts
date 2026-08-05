import { auth, configureAPIKey } from '@webcontainer/api';
import { getBuilderPublicEnv } from './public-env';

let configuredKey: string | null = null;
let configuredAuthKey: string | null = null;

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.local')
  );
}

export function resolveWebContainerApiKey(): string {
  const fromWindow = getBuilderPublicEnv().webcontainerApiKey;
  if (fromWindow) {
    return fromWindow;
  }

  const fromVite = (import.meta.env.VITE_WEBCONTAINER_API_KEY as string | undefined)?.trim();
  return fromVite || '';
}

function resolveWebContainerAuthScope(): string {
  const fromVite = (import.meta.env.VITE_WEBCONTAINER_AUTH_SCOPE as string | undefined)?.trim();
  return fromVite ?? '';
}

function ensureWebContainerAuthInitialized(clientId: string): void {
  if (configuredAuthKey === clientId) {
    return;
  }

  const result = auth.init({
    clientId,
    scope: resolveWebContainerAuthScope(),
  });

  if (result && typeof result === 'object' && 'status' in result && result.status === 'auth-failed') {
    console.warn('[webcontainer] auth.init failed', result.error, result.description);
  }

  configuredAuthKey = clientId;
}

/**
 * Production hosts (builder.indobase.in / .fun) require a StackBlitz WebContainer API key
 * with the domain allowlisted. Without it, stackblitz.com/headless returns 404 and preview dies.
 * Localhost is exempt.
 *
 * StackBlitz requires both configureAPIKey and auth.init before WebContainer.boot.
 *
 * Prefer calling after `whenBuilderPublicEnvReady()` so the sync/async bootstrap can populate
 * `window.__INDOBASE_BUILDER_PUBLIC__` (health `webcontainerApiKey: ok` only means the *server*
 * has the env var — not that the browser has it yet).
 */
export function ensureWebContainerApiKeyConfigured(): void {
  const key = resolveWebContainerApiKey();

  if (!key) {
    if (typeof window !== 'undefined' && !isLocalHostname(window.location.hostname)) {
      throw new Error(
        'WebContainer API key is not configured for this host. Set WEBCONTAINER_API_KEY on the Builder service (StackBlitz API Console → Keys & Domains), allowlist builder.indobase.in / builder.indobase.fun, then redeploy or restart the service.',
      );
    }

    return;
  }

  if (configuredKey !== key) {
    configureAPIKey(key);
    configuredKey = key;
  }

  ensureWebContainerAuthInitialized(key);
}

export function isMissingWebContainerApiKeyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /WebContainer API key is not configured/i.test(message);
}
