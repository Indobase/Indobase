export type MeResponse = {
  email: string
  projectRef: string
  orgSlug: string
  projectName?: string
  organizationName?: string
  role: string
  studioUrl: string
  attachCustomDomainsUrl: string
}

export type DomainSearchResult = {
  domainName: string
  purchasable: boolean
  premium: boolean
  purchaseType: string
  purchasePrice: number | null
  customerPriceInr: number | null
  years: number
}

export type DomainRegistration = {
  id: string
  domain_name: string
  status: string
  years: number
  customer_price_inr_paise: number
  nameservers: string[] | null
  inserted_at: string
  completed_at: string | null
  last_error: string | null
}

async function parseJson<T>(response: Response): Promise<T & { message?: string }> {
  return (await response.json()) as T & { message?: string }
}

export async function fetchMe(): Promise<MeResponse> {
  const response = await fetch('/api/me', { credentials: 'include' })
  const payload = await parseJson<MeResponse>(response)
  if (!response.ok) throw new Error(payload.message ?? 'Session expired')
  return payload
}

export async function searchDomains(query: string, years = 1): Promise<DomainSearchResult[]> {
  const response = await fetch('/api/search', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, years }),
  })
  const payload = await parseJson<{ results?: DomainSearchResult[] }>(response)
  if (!response.ok) throw new Error(payload.message ?? 'Search failed')
  return payload.results ?? []
}

export async function listRegistrations(): Promise<DomainRegistration[]> {
  const response = await fetch('/api/registrations', { credentials: 'include' })
  const payload = await parseJson<{ registrations?: DomainRegistration[] }>(response)
  if (!response.ok) throw new Error(payload.message ?? 'Failed to load domains')
  return payload.registrations ?? []
}

export type PurchaseIntent = {
  registration: { id: string; domain_name: string }
  razorpay: { key_id: string; order_id: string; amount: number; currency: 'INR' }
}

export async function createPurchaseIntent(domain: string, years = 1): Promise<PurchaseIntent> {
  const response = await fetch('/api/purchase-intent', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain, years }),
  })
  const payload = await parseJson<PurchaseIntent>(response)
  if (!response.ok) throw new Error(payload.message ?? 'Could not start checkout')
  return payload
}

export async function confirmPurchase(input: {
  registration_id: string
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}): Promise<{ registration: DomainRegistration; attach_custom_domain_url?: string | null }> {
  const response = await fetch('/api/confirm', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = await parseJson<{
    registration: DomainRegistration
    attach_custom_domain_url?: string | null
  }>(response)
  if (!response.ok) throw new Error(payload.message ?? 'Payment confirmation failed')
  return payload
}

export function formatInr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatInrPaise(paise: number): string {
  return formatInr(paise / 100)
}
