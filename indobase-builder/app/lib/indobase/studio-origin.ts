/** Production Studio origin — used when no env / hostname sibling applies. */
export const DEFAULT_STUDIO_URL = 'https://studio.indobase.in';

/**
 * Map Builder host → sibling Studio host (builder.X → studio.X).
 * Lets the same Docker image serve prod (.in) and Hostinger staging (.fun).
 */
export function resolveStudioUrlFromBuilderHostname(hostname: string): string | null {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || host.startsWith('127.')) {
    return null;
  }

  if (host.startsWith('builder.')) {
    return `https://studio.${host.slice('builder.'.length)}`;
  }

  return null;
}

function normalizeOrigin(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/**
 * Resolve the Studio origin for Connect-via-Studio and related client links.
 * Priority: explicit env → Builder hostname sibling → production default.
 */
export function resolveDefaultStudioUrl(options?: {
  envStudioUrl?: string | null;
  hostname?: string | null;
}): string {
  const fromEnv = options?.envStudioUrl?.trim();
  if (fromEnv) {
    return normalizeOrigin(fromEnv);
  }

  const hostname =
    options?.hostname ?? (typeof window !== 'undefined' ? window.location.hostname : undefined);

  if (hostname) {
    const sibling = resolveStudioUrlFromBuilderHostname(hostname);
    if (sibling) {
      return sibling;
    }
  }

  return DEFAULT_STUDIO_URL;
}

/** Vite-baked Studio URL when a staging-specific image is built. */
export function readViteStudioUrl(): string | undefined {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
    const value = env?.VITE_INDOBASE_STUDIO_URL?.trim() || env?.VITE_STUDIO_URL?.trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}
