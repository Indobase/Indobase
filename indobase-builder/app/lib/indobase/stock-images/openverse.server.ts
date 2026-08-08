/**
 * Openverse stock search for Builder — CC commercial-friendly images.
 * Mirrors Design's Openverse client so Builder does not invent Pexels/Unsplash URLs.
 * @see https://api.openverse.org/v1/
 *
 * Optional: OPENVERSE_CLIENT_ID / OPENVERSE_CLIENT_SECRET for higher rate limits.
 */

export type OpenverseEnv = {
  OPENVERSE_API_BASE?: string;
  OPENVERSE_CLIENT_ID?: string;
  OPENVERSE_CLIENT_SECRET?: string;
};

function resolveBase(env?: OpenverseEnv): string {
  const fromEnv = env?.OPENVERSE_API_BASE || process.env.OPENVERSE_API_BASE || 'https://api.openverse.org/v1';
  return fromEnv.replace(/\/$/, '');
}

export type BuilderStockImage = {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  attribution: string;
  license: string;
};

type TokenCache = { accessToken: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

async function getAccessToken(env?: OpenverseEnv): Promise<string | null> {
  const clientId = (env?.OPENVERSE_CLIENT_ID || process.env.OPENVERSE_CLIENT_ID)?.trim();
  const clientSecret = (env?.OPENVERSE_CLIENT_SECRET || process.env.OPENVERSE_CLIENT_SECRET)?.trim();

  if (!clientId || !clientSecret) {
    return null;
  }

  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });
  const resp = await fetch(`${resolveBase(env)}/auth_tokens/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });

  if (!resp.ok) {
    return null;
  }

  const json = (await resp.json()) as { access_token?: string; expires_in?: number };

  if (!json.access_token) {
    return null;
  }

  tokenCache = {
    accessToken: json.access_token,
    expiresAt: Date.now() + Math.max(60, Number(json.expires_in) || 3600) * 1000,
  };

  return tokenCache.accessToken;
}

async function openverseFetch(pathAndQuery: string, env?: OpenverseEnv): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'IndobaseBuilder/1.0 (+https://indobase.in)',
  };
  const token = await getAccessToken(env);

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return fetch(`${resolveBase(env)}${pathAndQuery}`, { headers });
}

export async function searchOpenverseImages(
  opts: {
    q: string;
    pageSize?: number;
  },
  env?: OpenverseEnv,
): Promise<BuilderStockImage[]> {
  const q = opts.q.trim().slice(0, 120);

  if (!q) {
    return [];
  }

  const pageSize = Math.max(1, Math.min(8, opts.pageSize ?? 4));
  const params = new URLSearchParams({
    q,
    page: '1',
    page_size: String(pageSize),
    license_type: 'commercial',
    mature: 'false',
  });

  const resp = await openverseFetch(`/images/?${params}`, env);

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Openverse search failed (${resp.status}): ${text.slice(0, 180)}`);
  }

  const json = (await resp.json()) as {
    results?: Array<Record<string, unknown>>;
  };

  return (json.results || [])
    .map((r) => ({
      id: String(r.id || ''),
      title: String(r.title || 'Untitled'),
      url: String(r.url || ''),
      thumbnail: String(r.thumbnail || r.url || ''),
      license: String(r.license || ''),
      attribution:
        typeof r.attribution === 'string' && r.attribution
          ? r.attribution
          : `"${r.title || 'Image'}" — ${r.license || 'CC'}`,
    }))
    .filter((r) => r.id && r.url.startsWith('https://'));
}

/** Resolve one query to a single best URL (first commercial result). */
export async function resolveStockImageUrl(
  query: string,
  env?: OpenverseEnv,
): Promise<BuilderStockImage | null> {
  const results = await searchOpenverseImages({ q: query, pageSize: 3 }, env);
  return results[0] ?? null;
}
