/**
 * Thin HTTP client for the domain registrar Core API (name.com).
 * Provider name is server-only — never expose in customer UI.
 */

export type NamecomConfig = {
  baseUrl: string
  username: string
  apiToken: string
}

export type NamecomAvailabilityResult = {
  domainName: string
  purchasable: boolean
  premium: boolean
  purchaseType: string
  purchasePrice: number | null
  renewalPrice: number | null
}

export type NamecomTldPricing = {
  tld: string
  registrationPrice: number | null
  renewalPrice: number | null
  transferPrice: number | null
}

export type NamecomRegisterDomainInput = {
  domainName: string
  years?: number
  /** Required when premium === true from availability check */
  purchasePrice?: number
}

export type NamecomRegisterDomainResult = {
  domainName: string
  orderId?: number
  expireDate?: string
}

export class NamecomApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown
  ) {
    super(message)
    this.name = 'NamecomApiError'
  }
}

export function resolveNamecomConfig(): NamecomConfig | null {
  const username = process.env.NAMECOM_USERNAME?.trim()
  const apiToken = process.env.NAMECOM_API_TOKEN?.trim()
  if (!username || !apiToken) return null

  const baseUrl = (
    process.env.NAMECOM_API_BASE?.trim() || 'https://api.name.com'
  ).replace(/\/$/, '')

  return { baseUrl, username, apiToken }
}

export function isNamecomConfigured(): boolean {
  return resolveNamecomConfig() !== null
}

function authHeader(config: NamecomConfig): string {
  return `Basic ${Buffer.from(`${config.username}:${config.apiToken}`).toString('base64')}`
}

async function namecomRequest<T>(
  config: NamecomConfig,
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(config),
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }

  if (!response.ok) {
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'message' in payload &&
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : `Registrar API error (${response.status})`
    throw new NamecomApiError(message, response.status, payload)
  }

  return payload as T
}

function mapAvailability(row: Record<string, unknown>): NamecomAvailabilityResult {
  return {
    domainName: String(row.domainName ?? ''),
    purchasable: Boolean(row.purchasable),
    premium: Boolean(row.premium),
    purchaseType: String(row.purchaseType ?? 'registration'),
    purchasePrice:
      typeof row.purchasePrice === 'number'
        ? row.purchasePrice
        : row.purchasePrice != null
          ? Number(row.purchasePrice)
          : null,
    renewalPrice:
      typeof row.renewalPrice === 'number'
        ? row.renewalPrice
        : row.renewalPrice != null
          ? Number(row.renewalPrice)
          : null,
  }
}

/** POST /core/v1/domains:checkAvailability — up to 50 names per call */
export async function checkAvailability(
  domainNames: string[],
  config: NamecomConfig = resolveNamecomConfig()!
): Promise<NamecomAvailabilityResult[]> {
  const cleaned = domainNames.map((d) => d.trim().toLowerCase()).filter(Boolean)
  if (!cleaned.length) return []

  const payload = await namecomRequest<{ results?: Record<string, unknown>[] }>(
    config,
    '/core/v1/domains:checkAvailability',
    {
      method: 'POST',
      body: JSON.stringify({ domainNames: cleaned }),
    }
  )

  return (payload.results ?? []).map(mapAvailability)
}

/** GET /core/v1/tldpricing — full catalog or filter client-side by TLD */
export async function getTldPricingList(
  config: NamecomConfig = resolveNamecomConfig()!
): Promise<NamecomTldPricing[]> {
  const payload = await namecomRequest<{ tlds?: Record<string, unknown>[] }>(
    config,
    '/core/v1/tldpricing'
  )

  return (payload.tlds ?? []).map((row) => ({
    tld: String(row.tld ?? '').replace(/^\./, ''),
    registrationPrice:
      typeof row.registrationPrice === 'number' ? row.registrationPrice : null,
    renewalPrice: typeof row.renewalPrice === 'number' ? row.renewalPrice : null,
    transferPrice: typeof row.transferPrice === 'number' ? row.transferPrice : null,
  }))
}

/** GET /core/v1/tldpricing/{tld} when supported; falls back to list scan */
export async function getPricingForTld(
  tld: string,
  config: NamecomConfig = resolveNamecomConfig()!
): Promise<NamecomTldPricing | null> {
  const normalized = tld.replace(/^\./, '').toLowerCase()
  if (!normalized) return null

  try {
    const row = await namecomRequest<Record<string, unknown>>(
      config,
      `/core/v1/tldpricing/${encodeURIComponent(normalized)}`
    )
    return {
      tld: String(row.tld ?? normalized).replace(/^\./, ''),
      registrationPrice:
        typeof row.registrationPrice === 'number' ? row.registrationPrice : null,
      renewalPrice: typeof row.renewalPrice === 'number' ? row.renewalPrice : null,
      transferPrice: typeof row.transferPrice === 'number' ? row.transferPrice : null,
    }
  } catch (error) {
    if (error instanceof NamecomApiError && error.status === 404) {
      const all = await getTldPricingList(config)
      return all.find((entry) => entry.tld === normalized) ?? null
    }
    throw error
  }
}

/** POST /core/v1/domains — register after payment confirmed */
export async function registerDomain(
  input: NamecomRegisterDomainInput,
  config: NamecomConfig = resolveNamecomConfig()!
): Promise<NamecomRegisterDomainResult> {
  const domain: Record<string, unknown> = {
    domainName: input.domainName.trim().toLowerCase(),
    years: input.years ?? 1,
  }
  if (input.purchasePrice != null) {
    domain.purchasePrice = input.purchasePrice
  }

  const payload = await namecomRequest<{ domain?: Record<string, unknown>; order?: number }>(
    config,
    '/core/v1/domains',
    {
      method: 'POST',
      body: JSON.stringify({ domain }),
    }
  )

  const created = payload.domain ?? {}
  return {
    domainName: String(created.domainName ?? input.domainName),
    orderId: typeof payload.order === 'number' ? payload.order : undefined,
    expireDate:
      typeof created.expireDate === 'string' ? created.expireDate : undefined,
  }
}

/** POST /core/v1/domains/{domainName}:setNameservers */
export async function setNameservers(
  domainName: string,
  nameservers: string[],
  config: NamecomConfig = resolveNamecomConfig()!
): Promise<string[]> {
  const payload = await namecomRequest<{ nameservers?: string[] }>(
    config,
    `/core/v1/domains/${encodeURIComponent(domainName.trim().toLowerCase())}:setNameservers`,
    {
      method: 'POST',
      body: JSON.stringify({ nameservers }),
    }
  )
  return payload.nameservers ?? nameservers
}

/** GET /core/v1/hello — connectivity probe (ops / health only) */
export async function pingHello(config: NamecomConfig = resolveNamecomConfig()!): Promise<{
  motd?: string
  username?: string
}> {
  return namecomRequest(config, '/core/v1/hello')
}

export function parseDomainParts(domainName: string): { label: string; tld: string } | null {
  const normalized = domainName.trim().toLowerCase()
  const dot = normalized.indexOf('.')
  if (dot <= 0 || dot === normalized.length - 1) return null
  return {
    label: normalized.slice(0, dot),
    tld: normalized.slice(dot + 1),
  }
}
