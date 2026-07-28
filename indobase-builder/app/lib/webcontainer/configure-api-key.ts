import { configureAPIKey } from '@webcontainer/api';

declare global {
  interface Window {
    __INDOBASE_BUILDER_PUBLIC__?: {
      webcontainerApiKey?: string;
    };
  }
}

let configuredKey: string | null = null;

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.local')
  );
}

export function resolveWebContainerApiKey(): string {
  if (typeof window !== 'undefined') {
    const fromWindow = window.__INDOBASE_BUILDER_PUBLIC__?.webcontainerApiKey?.trim();
    if (fromWindow) {
      return fromWindow;
    }
  }

  const fromVite = (import.meta.env.VITE_WEBCONTAINER_API_KEY as string | undefined)?.trim();
  return fromVite || '';
}

/**
 * Production hosts (builder.indobase.in / .fun) require a StackBlitz WebContainer API key
 * with the domain allowlisted. Without it, stackblitz.com/headless returns 404 and preview dies.
 * Localhost is exempt.
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

  if (configuredKey === key) {
    return;
  }

  configureAPIKey(key);
  configuredKey = key;
}

export function isMissingWebContainerApiKeyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /WebContainer API key is not configured/i.test(message);
}
