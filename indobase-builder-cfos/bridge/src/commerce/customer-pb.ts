/**
 * PocketBase adapter for commerce customers — service-role only.
 * Storefront never reads/writes these collections directly.
 */
import {
  adminAuth,
  adminAuthHeader,
  formatPbError,
  getManagedBackendConfig,
  physicalCollectionName,
  sanitizeAppId,
  type PbErrorPayload,
} from '../pocketbase/managed.js'
import {
  evaluateGuestOrderClaim,
  newCustomerId,
  normalizeCustomerEmail,
  type CustomerProfile,
  type CustomerType,
  type OrderOwnership,
} from './customer-identity.js'
import { pocketBaseDateTime } from './pb-adapter.js'

async function adminToken(): Promise<{ token: string; base: string; appId: string }> {
  const config = getManagedBackendConfig()
  if (!config) throw new Error('Indobase backend is not configured')
  const token = await adminAuth(config)
  return { token, base: config.adminUrl.replace(/\/+$/, ''), appId: '' }
}

async function pbJson<T>(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; body: T & PbErrorPayload }> {
  const res = await fetch(url, init)
  const body = (await res.json().catch(() => ({}))) as T & PbErrorPayload
  return { ok: res.ok, status: res.status, body }
}

function headers(token: string): Record<string, string> {
  return { Authorization: adminAuthHeader(token), 'Content-Type': 'application/json' }
}

function profileFromRow(row: Record<string, unknown>, projectRef: string): CustomerProfile {
  return {
    id: String(row.id || ''),
    projectRef,
    email: normalizeCustomerEmail(String(row.email || '')),
    name: String(row.name || ''),
    phone: row.phone ? String(row.phone) : undefined,
    customerType: row.customer_type === 'registered' ? 'registered' : 'guest',
    authIdentityId: row.auth_identity_id ? String(row.auth_identity_id) : null,
    emailVerified: row.email_verified === true,
    createdAt: String(row.created_at || ''),
  }
}

function ownershipFromRow(row: Record<string, unknown>, projectRef: string): OrderOwnership {
  return {
    orderId: String(row.id || ''),
    projectRef,
    customerId: String(row.customer_id || ''),
    customerType: row.customer_type === 'registered' ? 'registered' : 'guest',
    email: normalizeCustomerEmail(String(row.email || '')),
    guestTokenHash: row.guest_token_hash ? String(row.guest_token_hash) : undefined,
  }
}

export async function createGuestCustomer(input: {
  projectRef: string
  email: string
  name?: string
  phone?: string
}): Promise<CustomerProfile> {
  const appId = sanitizeAppId(input.projectRef)
  const { token, base } = await adminToken()
  const col = physicalCollectionName(appId, 'customers')
  const id = newCustomerId()
  const { ok, body } = await pbJson<Record<string, unknown>>(`${base}/api/collections/${col}/records`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      id,
      owner: appId,
      email: normalizeCustomerEmail(input.email),
      name: input.name || '',
      phone: input.phone || '',
      customer_type: 'guest',
      auth_identity_id: '',
      email_verified: false,
      created_at: pocketBaseDateTime(),
    }),
  })
  if (!ok || !body.id) throw new Error(formatPbError(body, 'Guest customer create failed'))
  return profileFromRow(body, appId)
}

export async function findRegisteredCustomer(
  projectRef: string,
  email: string,
): Promise<CustomerProfile | null> {
  const appId = sanitizeAppId(projectRef)
  const { token, base } = await adminToken()
  const col = physicalCollectionName(appId, 'customers')
  const safe = normalizeCustomerEmail(email).replace(/"/g, '')
  const filter = encodeURIComponent(`email="${safe}" && customer_type="registered"`)
  const { ok, body } = await pbJson<{ items?: Array<Record<string, unknown>> }>(
    `${base}/api/collections/${col}/records?perPage=1&filter=${filter}`,
    { headers: { Authorization: adminAuthHeader(token) } },
  )
  if (!ok || !body.items?.[0]) return null
  return profileFromRow(body.items[0], appId)
}

export async function upsertRegisteredCustomer(input: {
  projectRef: string
  email: string
  name?: string
  phone?: string
  /** Must be true — only the OTP verify path may set this. */
  emailVerified: boolean
}): Promise<CustomerProfile> {
  if (!input.emailVerified) {
    throw new Error('Registered customer requires verified email')
  }
  const existing = await findRegisteredCustomer(input.projectRef, input.email)
  const appId = sanitizeAppId(input.projectRef)
  const { token, base } = await adminToken()
  const col = physicalCollectionName(appId, 'customers')
  if (existing) {
    const authId = existing.authIdentityId || newCustomerId()
    await pbJson(`${base}/api/collections/${col}/records/${encodeURIComponent(existing.id)}`, {
      method: 'PATCH',
      headers: headers(token),
      body: JSON.stringify({
        name: input.name || existing.name,
        phone: input.phone || existing.phone || '',
        auth_identity_id: authId,
        customer_type: 'registered',
        email_verified: true,
      }),
    })
    return {
      ...existing,
      authIdentityId: authId,
      name: input.name || existing.name,
      emailVerified: true,
    }
  }
  const id = newCustomerId()
  const authId = newCustomerId()
  const { ok, body } = await pbJson<Record<string, unknown>>(`${base}/api/collections/${col}/records`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      id,
      owner: appId,
      email: normalizeCustomerEmail(input.email),
      name: input.name || '',
      phone: input.phone || '',
      customer_type: 'registered',
      auth_identity_id: authId,
      email_verified: true,
      created_at: pocketBaseDateTime(),
    }),
  })
  if (!ok || !body.id) throw new Error(formatPbError(body, 'Registered customer create failed'))
  return profileFromRow(body, appId)
}

export async function claimGuestOrdersForEmail(input: {
  projectRef: string
  email: string
  registeredCustomerId: string
  emailVerified: boolean
}): Promise<number> {
  if (!input.emailVerified) return 0
  const appId = sanitizeAppId(input.projectRef)
  const { token, base } = await adminToken()
  const col = physicalCollectionName(appId, 'orders')
  const safe = normalizeCustomerEmail(input.email).replace(/"/g, '')
  const filter = encodeURIComponent(`email="${safe}" && customer_type="guest"`)
  const { ok, body } = await pbJson<{ items?: Array<Record<string, unknown>> }>(
    `${base}/api/collections/${col}/records?perPage=100&filter=${filter}`,
    { headers: { Authorization: adminAuthHeader(token) } },
  )
  if (!ok) return 0
  let n = 0
  for (const row of body.items || []) {
    if (!row.id) continue
    const ownership = ownershipFromRow(row, appId)
    const result = evaluateGuestOrderClaim(ownership, {
      customerId: input.registeredCustomerId,
      projectRef: appId,
      email: input.email,
      emailVerified: true,
    })
    if (!result.ok || result.outcome === 'already_owned') continue
    await pbJson(`${base}/api/collections/${col}/records/${encodeURIComponent(String(row.id))}`, {
      method: 'PATCH',
      headers: headers(token),
      body: JSON.stringify({
        customer_id: input.registeredCustomerId,
        customer_type: 'registered',
        guest_token_hash: '',
      }),
    })
    n += 1
  }
  return n
}

export async function getOrderOwnership(
  projectRef: string,
  orderId: string,
): Promise<OrderOwnership | null> {
  const appId = sanitizeAppId(projectRef)
  const { token, base } = await adminToken()
  const col = physicalCollectionName(appId, 'orders')
  const { ok, body } = await pbJson<Record<string, unknown>>(
    `${base}/api/collections/${col}/records/${encodeURIComponent(orderId)}`,
    { headers: { Authorization: adminAuthHeader(token) } },
  )
  if (!ok || !body.id) return null
  return ownershipFromRow(body, appId)
}

export async function listOrdersForCustomer(
  projectRef: string,
  customerId: string,
): Promise<Array<Record<string, unknown>>> {
  const appId = sanitizeAppId(projectRef)
  const { token, base } = await adminToken()
  const col = physicalCollectionName(appId, 'orders')
  const filter = encodeURIComponent(`customer_id="${customerId.replace(/"/g, '')}"`)
  const { ok, body } = await pbJson<{ items?: Array<Record<string, unknown>> }>(
    `${base}/api/collections/${col}/records?perPage=50&filter=${filter}`,
    { headers: { Authorization: adminAuthHeader(token) } },
  )
  if (!ok) throw new Error(formatPbError(body, 'Failed to list customer orders'))
  return body.items || []
}

export async function saveCustomerAddress(input: {
  projectRef: string
  customerId: string
  address?: {
    line1?: string
    line2?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
  }
}): Promise<void> {
  if (!input.address || !Object.values(input.address).some((v) => String(v || '').trim())) return
  const appId = sanitizeAppId(input.projectRef)
  const { token, base } = await adminToken()
  const col = physicalCollectionName(appId, 'customer_addresses')
  await pbJson(`${base}/api/collections/${col}/records`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      id: newCustomerId(),
      owner: appId,
      customer_id: input.customerId,
      line1: input.address.line1 || '',
      line2: input.address.line2 || '',
      city: input.address.city || '',
      state: input.address.state || '',
      postal_code: input.address.postalCode || '',
      country: input.address.country || '',
      is_default: true,
      created_at: pocketBaseDateTime(),
    }),
  })
}

export type { CustomerType }
