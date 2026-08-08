/**
 * Resolve commercial-friendly stock image URLs (Openverse) for product catalogs.
 * Same source Builder uses — agents must not invent Unsplash/Pexels URLs.
 */

export type ProductImageHit = {
  id: string
  title: string
  url: string
  thumbnail: string
  attribution: string
  license: string
  query: string
}

type TokenCache = { accessToken: string; expiresAt: number }
let tokenCache: TokenCache | null = null

function openverseBase(): string {
  return (process.env.OPENVERSE_API_BASE || 'https://api.openverse.org/v1').replace(/\/$/, '')
}

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.OPENVERSE_CLIENT_ID?.trim()
  const clientSecret = process.env.OPENVERSE_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.accessToken

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  })
  const resp = await fetch(`${openverseBase()}/auth_tokens/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  })
  if (!resp.ok) return null
  const json = (await resp.json()) as { access_token?: string; expires_in?: number }
  if (!json.access_token) return null
  tokenCache = {
    accessToken: json.access_token,
    expiresAt: Date.now() + Math.max(60, Number(json.expires_in) || 3600) * 1000,
  }
  return tokenCache.accessToken
}

async function searchOne(query: string, pageSize: number): Promise<ProductImageHit[]> {
  const q = query.trim().slice(0, 120)
  if (!q) return []
  const params = new URLSearchParams({
    q,
    page: '1',
    page_size: String(Math.max(1, Math.min(8, pageSize))),
    license_type: 'commercial',
    mature: 'false',
  })
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'IndobaseStudio/1.0 (+https://indobase.in)',
  }
  const token = await getAccessToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const resp = await fetch(`${openverseBase()}/images/?${params}`, { headers })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`Image search failed (${resp.status}): ${text.slice(0, 160)}`)
  }
  const json = (await resp.json()) as { results?: Array<Record<string, unknown>> }
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
      query: q,
    }))
    .filter((r) => r.id && r.url.startsWith('https://'))
}

export async function resolveProductImages({
  queries,
  pageSize = 3,
}: {
  queries: string[]
  pageSize?: number
}): Promise<{
  ok: boolean
  message: string
  images: ProductImageHit[]
  by_query: Record<string, ProductImageHit | null>
  code?: string
}> {
  const unique = [...new Set(queries.map((q) => q.trim()).filter(Boolean))].slice(0, 12)
  if (unique.length === 0) {
    return {
      ok: false,
      code: 'query_required',
      message: 'Provide queries[] (e.g. product names) to resolve image URLs',
      images: [],
      by_query: {},
    }
  }

  const by_query: Record<string, ProductImageHit | null> = {}
  const images: ProductImageHit[] = []
  try {
    for (const q of unique) {
      const hits = await searchOne(q, pageSize)
      const best = hits[0] ?? null
      by_query[q] = best
      if (best) images.push(best)
    }
  } catch (err) {
    return {
      ok: false,
      code: 'search_failed',
      message: err instanceof Error ? err.message : 'Image search failed',
      images,
      by_query,
    }
  }

  return {
    ok: images.length > 0,
    message:
      images.length > 0
        ? `Resolved ${images.length} image(s). Set product image_url from these HTTPS URLs (Openverse / CC commercial).`
        : 'No commercial images found — try different queries or use Design format assets',
    images,
    by_query,
  }
}
