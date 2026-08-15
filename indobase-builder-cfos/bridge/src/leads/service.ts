/**
 * Landing enquiries — visitors submit, the bridge writes with an admin token.
 * The `leads` collection stays admin-only so a published page can neither spam
 * nor read the owner's enquiry list from the browser.
 */
import { applyArchitectureBlueprint } from '../pocketbase/architecture.js'
import {
  adminAuth,
  adminAuthHeader,
  getManagedBackendConfig,
  physicalCollectionName,
  sanitizeAppId,
} from '../pocketbase/managed.js'
import { pocketBaseDateTime } from '../commerce/pb-adapter.js'

export type LeadInput = {
  name?: unknown
  email?: unknown
  phone?: unknown
  message?: unknown
  source?: unknown
}

export type NormalizedLead = {
  name: string
  email: string
  phone: string
  message: string
  source: string
}

export type LeadValidation =
  | { ok: true; lead: NormalizedLead }
  | { ok: false; code: 'invalid_request'; message: string }

const LIMITS = { name: 120, email: 200, phone: 40, message: 2000, source: 120 }

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  // Strip control characters so a pasted payload cannot break the record.
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, max)
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)
}

function digitsIn(value: string): number {
  return (value.match(/\d/g) || []).length
}

/** Messages here are read by the visitor, so they stay plain and blameless. */
export function normalizeLead(raw: LeadInput): LeadValidation {
  const name = text(raw.name, LIMITS.name)
  const email = text(raw.email, LIMITS.email)
  const phone = text(raw.phone, LIMITS.phone)
  const message = text(raw.message, LIMITS.message)
  const source = text(raw.source, LIMITS.source) || 'website'

  if (name.length < 2) {
    return { ok: false, code: 'invalid_request', message: 'Please add your name.' }
  }
  if (!email && !phone) {
    return {
      ok: false,
      code: 'invalid_request',
      message: 'Add an email or phone number so we can reply.',
    }
  }
  if (email && !looksLikeEmail(email)) {
    return { ok: false, code: 'invalid_request', message: 'That email address looks incomplete.' }
  }
  if (phone && digitsIn(phone) < 7) {
    return { ok: false, code: 'invalid_request', message: 'That phone number looks incomplete.' }
  }

  return { ok: true, lead: { name, email, phone, message, source } }
}

const RATE_WINDOW_MS = 10 * 60 * 1000
const RATE_MAX = 5
const recentSubmissions = new Map<string, number[]>()

export function clearLeadRateLimitForTests(): void {
  recentSubmissions.clear()
}

/** Per project + client, so one noisy visitor cannot bury an owner's inbox. */
export function rateLimitLead(key: string, now: number = Date.now()): { allowed: boolean } {
  const hits = (recentSubmissions.get(key) || []).filter((at) => now - at < RATE_WINDOW_MS)
  if (hits.length >= RATE_MAX) {
    recentSubmissions.set(key, hits)
    return { allowed: false }
  }
  hits.push(now)
  recentSubmissions.set(key, hits)
  return { allowed: true }
}

export type LeadSubmitResult =
  | { ok: true; id: string }
  | { ok: false; code: 'backend_unavailable' | 'write_failed' }

export async function submitLead(input: {
  projectRef: string
  lead: NormalizedLead
}): Promise<LeadSubmitResult> {
  const appId = sanitizeAppId(input.projectRef)
  const config = getManagedBackendConfig()
  if (!appId || !config) return { ok: false, code: 'backend_unavailable' }

  try {
    await applyArchitectureBlueprint({ appId, blueprint: 'landing' })
    const token = await adminAuth(config)
    const base = config.adminUrl.replace(/\/+$/, '')
    const collection = physicalCollectionName(appId, 'leads')
    const res = await fetch(`${base}/api/collections/${collection}/records`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: adminAuthHeader(token),
      },
      body: JSON.stringify({
        ...input.lead,
        status: 'new',
        created_at: pocketBaseDateTime(),
      }),
    })
    if (!res.ok) return { ok: false, code: 'write_failed' }
    const body = (await res.json().catch(() => ({}))) as { id?: unknown }
    return { ok: true, id: typeof body.id === 'string' ? body.id : '' }
  } catch {
    return { ok: false, code: 'backend_unavailable' }
  }
}

export type LeadRecord = {
  id: string
  name: string
  email: string
  phone: string
  message: string
  source: string
  status: string
  createdAt: string
}

/** Operator-side read: the owner's enquiry inbox for this project. */
export async function listLeads(projectRef: string): Promise<LeadRecord[]> {
  const appId = sanitizeAppId(projectRef)
  const config = getManagedBackendConfig()
  if (!appId || !config) return []

  const token = await adminAuth(config)
  const base = config.adminUrl.replace(/\/+$/, '')
  const collection = physicalCollectionName(appId, 'leads')
  const res = await fetch(
    `${base}/api/collections/${collection}/records?perPage=200&sort=-created_at`,
    { headers: { Authorization: adminAuthHeader(token) } },
  )
  if (!res.ok) return []
  const body = (await res.json().catch(() => ({}))) as { items?: Array<Record<string, unknown>> }
  return (body.items || []).map((row) => ({
    id: String(row.id || ''),
    name: String(row.name || ''),
    email: String(row.email || ''),
    phone: String(row.phone || ''),
    message: String(row.message || ''),
    source: String(row.source || 'website'),
    status: normalizeLeadStatus(row.status) || 'new',
    createdAt: String(row.created_at || row.created || ''),
  }))
}

export const LEAD_STATUSES = ['new', 'handled'] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

/** Only the two states an owner needs — anything else is treated as open. */
export function normalizeLeadStatus(raw: unknown): LeadStatus | null {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (value === 'handled' || value === 'closed' || value === 'done') return 'handled'
  if (value === 'new' || value === 'open' || value === 'unread') return 'new'
  return null
}

export function isOpenLeadStatus(status: string | null | undefined): boolean {
  return normalizeLeadStatus(status) !== 'handled'
}

/** PocketBase record ids are short alphanumerics — reject path tricks early. */
export function sanitizeLeadId(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const id = raw.trim()
  return /^[a-z0-9]{5,64}$/i.test(id) ? id : ''
}

export type LeadStatusUpdateResult =
  | { ok: true; id: string; status: LeadStatus }
  | { ok: false; code: 'invalid_request' | 'not_found' | 'backend_unavailable' | 'write_failed' }

/** Owner triage: mark an enquiry handled (or reopen it). Never callable from the public form. */
export async function updateLeadStatus(input: {
  projectRef: string
  leadId: string
  status: LeadStatus
}): Promise<LeadStatusUpdateResult> {
  const appId = sanitizeAppId(input.projectRef)
  const leadId = sanitizeLeadId(input.leadId)
  const status = normalizeLeadStatus(input.status)
  const config = getManagedBackendConfig()
  if (!status || !leadId) return { ok: false, code: 'invalid_request' }
  if (!appId || !config) return { ok: false, code: 'backend_unavailable' }

  try {
    await applyArchitectureBlueprint({ appId, blueprint: 'landing' })
    const token = await adminAuth(config)
    const base = config.adminUrl.replace(/\/+$/, '')
    const collection = physicalCollectionName(appId, 'leads')
    const res = await fetch(`${base}/api/collections/${collection}/records/${leadId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: adminAuthHeader(token),
      },
      body: JSON.stringify({ status }),
    })
    if (res.status === 404) return { ok: false, code: 'not_found' }
    if (!res.ok) return { ok: false, code: 'write_failed' }
    return { ok: true, id: leadId, status }
  } catch {
    return { ok: false, code: 'backend_unavailable' }
  }
}

/** Never surfaces engine detail: the visitor only needs to know what to do next. */
export function leadFailureMessage(code: string): string {
  if (code === 'rate_limited') {
    return 'We already have your enquiry — we will be in touch shortly.'
  }
  if (code === 'not_found') {
    return 'That enquiry is no longer in the inbox.'
  }
  if (code === 'invalid_request') {
    return 'We could not update that enquiry. Refresh and try again.'
  }
  return 'We could not send that just now. Please try again in a moment.'
}
