/**
 * Openverse stock search — CC-licensed images without Pexels/Unsplash keys.
 * @see https://api.openverse.org/v1/
 *
 * Optional env for higher rate limits (after email-verifying a registered app):
 *   OPENVERSE_CLIENT_ID / OPENVERSE_CLIENT_SECRET
 */

const OPENVERSE_BASE = (process.env.OPENVERSE_API_BASE || 'https://api.openverse.org/v1').replace(
  /\/$/,
  ''
)

export type StockImage = {
  id: string
  title: string
  url: string
  thumbnail: string
  width: number | null
  height: number | null
  license: string
  licenseUrl: string | null
  creator: string | null
  creatorUrl: string | null
  attribution: string
  foreignLandingUrl: string | null
  provider: string | null
}

type TokenCache = { accessToken: string; expiresAt: number }
let tokenCache: TokenCache | null = null

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.OPENVERSE_CLIENT_ID?.trim()
  const clientSecret = process.env.OPENVERSE_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null

  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.accessToken
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  })
  const resp = await fetch(`${OPENVERSE_BASE}/auth_tokens/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    console.warn('[openverse] token exchange failed', resp.status, text.slice(0, 200))
    return null
  }
  const json = (await resp.json()) as { access_token?: string; expires_in?: number }
  if (!json.access_token) return null
  tokenCache = {
    accessToken: json.access_token,
    expiresAt: Date.now() + Math.max(60, Number(json.expires_in) || 3600) * 1000,
  }
  return tokenCache.accessToken
}

async function openverseFetch(pathAndQuery: string): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = await getAccessToken()
  if (token) headers.Authorization = `Bearer ${token}`
  return fetch(`${OPENVERSE_BASE}${pathAndQuery}`, { headers })
}

export async function searchOpenverseImages(opts: {
  q: string
  page?: number
  pageSize?: number
}): Promise<{ results: StockImage[]; page: number; pageCount: number; resultCount: number }> {
  const q = opts.q.trim().slice(0, 120)
  if (!q) return { results: [], page: 1, pageCount: 0, resultCount: 0 }

  const page = Math.max(1, Math.min(50, opts.page ?? 1))
  const pageSize = Math.max(1, Math.min(40, opts.pageSize ?? 24))

  // Prefer commercially-usable CC (cc0 / public domain / by / by-sa). Avoid NC/ND for SaaS.
  const params = new URLSearchParams({
    q,
    page: String(page),
    page_size: String(pageSize),
    license_type: 'commercial',
    mature: 'false',
  })

  const resp = await openverseFetch(`/images/?${params}`)
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`Openverse search failed (${resp.status}): ${text.slice(0, 180)}`)
  }

  const json = (await resp.json()) as {
    results?: Array<Record<string, unknown>>
    page?: number
    page_count?: number
    result_count?: number
  }

  const results: StockImage[] = (json.results || []).map((r) => ({
    id: String(r.id || ''),
    title: String(r.title || 'Untitled'),
    url: String(r.url || ''),
    thumbnail: String(r.thumbnail || r.url || ''),
    width: typeof r.width === 'number' ? r.width : null,
    height: typeof r.height === 'number' ? r.height : null,
    license: String(r.license || ''),
    licenseUrl: typeof r.license_url === 'string' ? r.license_url : null,
    creator: typeof r.creator === 'string' ? r.creator : null,
    creatorUrl: typeof r.creator_url === 'string' ? r.creator_url : null,
    attribution:
      typeof r.attribution === 'string' && r.attribution
        ? r.attribution
        : `"${r.title || 'Image'}" — ${r.license || 'CC'}`,
    foreignLandingUrl: typeof r.foreign_landing_url === 'string' ? r.foreign_landing_url : null,
    provider: typeof r.provider === 'string' ? r.provider : null,
  }))

  return {
    results: results.filter((r) => r.id && r.url),
    page: json.page ?? page,
    pageCount: json.page_count ?? 0,
    resultCount: json.result_count ?? results.length,
  }
}

const ALLOWED_HOST_SUFFIXES = [
  'staticflickr.com',
  'flickr.com',
  'wikimedia.org',
  'upload.wikimedia.org',
  'nypl.org',
  'metmuseum.org',
  'smithsonianmag.com',
  'openverse.org',
  'wordpress.com',
  'wp.com',
  'rawpixel.com',
  'nasa.gov',
  'spaceflight.nasa.gov',
  'images.nasa.gov',
]

export function isAllowedStockUrl(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase()
  return ALLOWED_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))
}

export async function downloadStockImage(
  url: string
): Promise<{ mime: string; bytes: Buffer }> {
  if (!isAllowedStockUrl(url)) {
    throw new Error('stock image host is not allowed')
  }
  const resp = await fetch(url, {
    headers: { Accept: 'image/*,*/*', 'User-Agent': 'IndobaseDesign/1.0 (+https://indobase.in)' },
    redirect: 'follow',
  })
  if (!resp.ok) throw new Error(`failed to fetch stock image (${resp.status})`)
  const mime = (resp.headers.get('content-type') || 'image/jpeg').split(';')[0].trim()
  if (!mime.startsWith('image/')) throw new Error('remote file is not an image')
  const ab = await resp.arrayBuffer()
  const bytes = Buffer.from(ab)
  if (bytes.length > 4 * 1024 * 1024) throw new Error('stock image exceeds 4 MB')
  if (bytes.length < 32) throw new Error('stock image empty')
  return { mime, bytes }
}
