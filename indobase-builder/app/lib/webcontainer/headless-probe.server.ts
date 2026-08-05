const WEBCONTAINER_HEADLESS_VERSION = '1.6.1-internal.1';

function normalizeOrigin(origin: string): string {
  const trimmed = origin.trim();

  if (!trimmed) {
    return '';
  }

  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return url.origin;
  } catch {
    return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  }
}

/**
 * StackBlitz serves /headless only for allowlisted origins. A 404 means the API key exists but
 * this Builder host is not registered in the StackBlitz API Console (Keys & Domains).
 */
export async function probeWebContainerHeadless(clientId: string, origin: string): Promise<boolean> {
  const key = clientId.trim();
  const refererOrigin = normalizeOrigin(origin);

  if (!key || !refererOrigin) {
    return false;
  }

  const referer = `${refererOrigin}/`;
  const url = `https://stackblitz.com/headless?client_id=${encodeURIComponent(key)}&coep=credentialless&version=${encodeURIComponent(WEBCONTAINER_HEADLESS_VERSION)}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Referer: referer },
      redirect: 'follow',
    });

    return response.ok;
  } catch (error) {
    console.warn('[webcontainer] headless probe failed', error);
    return false;
  }
}

export function resolveBuilderPublicOrigin(
  requestUrl: string,
  env?: Record<string, string | undefined>,
): string {
  const fromEnv =
    env?.BUILDER_APP_URL?.trim() ||
    env?.VITE_BUILDER_APP_URL?.trim() ||
    process.env.BUILDER_APP_URL?.trim() ||
    process.env.VITE_BUILDER_APP_URL?.trim() ||
    '';

  if (fromEnv) {
    return normalizeOrigin(fromEnv);
  }

  try {
    return new URL(requestUrl).origin;
  } catch {
    return '';
  }
}
