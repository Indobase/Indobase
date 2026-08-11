/**
 * Builder operator email OTP against managed Indobase backend.
 * Engine-specific details stay server-side — never surface product names to operators.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

import type { OsWorkspaceSession } from '@indobase/platform-api'

import {
  adminAuth,
  createAppId,
  ensureManagedBackend,
  getManagedBackendConfig,
  type ManagedBackendConfig,
} from './managed.js'

type PendingOtp = {
  email: string
  otpId: string
  name: string
  createdAt: string
  expiresAt: string
}

type StoreFile = {
  version: 1
  pending: Record<string, PendingOtp>
}

const TTL_MS = 10 * 60 * 1000

function storePath(): string {
  // Prefer shared volume so Swarm replicas share OTP state.
  const root =
    process.env.INDOBASE_OTP_STORE_DIR?.trim() ||
    process.env.INDOBASE_AGENT_PRINCIPAL_DIR?.trim() ||
    process.env.INDOBASE_LAUNCH_ROOT?.trim() ||
    path.join(process.cwd(), '.indobase-launches')
  return path.join(root, 'pending-otp.json')
}

async function readStore(): Promise<StoreFile> {
  try {
    const raw = await fs.readFile(storePath(), 'utf8')
    const parsed = JSON.parse(raw) as StoreFile
    if (!parsed || parsed.version !== 1 || typeof parsed.pending !== 'object') {
      return { version: 1, pending: {} }
    }
    return parsed
  } catch {
    return { version: 1, pending: {} }
  }
}

async function writeStore(store: StoreFile): Promise<void> {
  const file = storePath()
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf8')
  await fs.rename(tmp, file)
}

function prune(store: StoreFile, now = Date.now()): StoreFile {
  const pending: Record<string, PendingOtp> = {}
  for (const [k, v] of Object.entries(store.pending)) {
    if (v && Date.parse(v.expiresAt) > now) pending[k] = v
  }
  return { version: 1, pending }
}

async function rememberOtp(input: { email: string; otpId: string; name: string }): Promise<void> {
  const email = input.email.trim().toLowerCase()
  if (!email || !input.otpId) return
  const now = Date.now()
  const store = prune(await readStore(), now)
  store.pending[email] = {
    email,
    otpId: input.otpId,
    name: input.name,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TTL_MS).toISOString(),
  }
  await writeStore(store)
}

/** Peek without deleting — consume only after successful verify. */
async function peekOtp(email: string): Promise<PendingOtp | null> {
  const key = email.trim().toLowerCase()
  const store = prune(await readStore())
  return store.pending[key] || null
}

async function consumeOtp(email: string, otpId: string): Promise<void> {
  const key = email.trim().toLowerCase()
  const store = prune(await readStore())
  const record = store.pending[key]
  if (record?.otpId === otpId) {
    delete store.pending[key]
    await writeStore(store)
  }
}

async function ensureSmtpConfigured(config: ManagedBackendConfig, token: string): Promise<void> {
  const password =
    process.env.POCKETBASE_SMTP_PASS?.trim() ||
    process.env.SMTP_PASS?.trim() ||
    process.env.RESEND_API_KEY?.trim() ||
    ''
  if (!password) return

  const host =
    process.env.POCKETBASE_SMTP_HOST?.trim() ||
    process.env.SMTP_HOST?.trim() ||
    'smtp.resend.com'
  const port = parseInt(
    process.env.POCKETBASE_SMTP_PORT?.trim() || process.env.SMTP_PORT?.trim() || '587',
    10,
  )
  const username =
    process.env.POCKETBASE_SMTP_USER?.trim() || process.env.SMTP_USER?.trim() || 'resend'
  const sender =
    process.env.POCKETBASE_SMTP_SENDER?.trim() ||
    process.env.SMTP_ADMIN_EMAIL?.trim() ||
    'auth@indobase.in'
  const senderName =
    process.env.POCKETBASE_SMTP_SENDER_NAME?.trim() ||
    process.env.SMTP_SENDER_NAME?.trim() ||
    'Indobase'

  const current = await fetch(`${config.adminUrl}/api/settings`, {
    headers: { Authorization: token },
  })
  const settings = (await current.json().catch(() => ({}))) as {
    smtp?: { enabled?: boolean; password?: string; host?: string }
    meta?: Record<string, unknown>
  }
  // Always re-apply password from env when provided — API never returns stored password.
  await fetch(`${config.adminUrl}/api/settings`, {
    method: 'PATCH',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      meta: {
        ...(settings.meta || {}),
        appName: 'Indobase',
        appURL: process.env.INDOBASE_BUILDER_PUBLIC_URL?.trim() || 'https://builder.indobase.in',
        senderName,
        senderAddress: sender,
      },
      smtp: {
        ...(settings.smtp || {}),
        enabled: true,
        host,
        port: Number.isFinite(port) ? port : 587,
        username,
        password,
        authMethod: 'PLAIN',
        tls: false,
      },
    }),
  }).catch(() => null)
}

async function ensureAuthCollectionReady(config: ManagedBackendConfig): Promise<void> {
  const token = await adminAuth(config)
  await ensureSmtpConfigured(config, token)

  const listResponse = await fetch(`${config.adminUrl}/api/collections?page=1&perPage=50`, {
    headers: { Authorization: token },
  })
  const listPayload = (await listResponse.json().catch(() => ({}))) as {
    items?: Array<{
      id: string
      name: string
      type?: string
      otp?: { enabled?: boolean; length?: number }
      createRule?: string | null
    }>
    message?: string
  }
  if (!listResponse.ok) {
    throw new Error(listPayload.message || 'Failed to load auth collections')
  }

  const users = listPayload.items?.find((item) => item.name === 'users' && item.type === 'auth')
  if (!users) {
    throw new Error('Indobase backend auth collection is missing')
  }

  // OTP auto-create needs a create rule; require email present (not fully world-open junk).
  const desiredCreate = '@request.body.email != "" || @request.data.email != ""'
  const needsPatch =
    !users.otp?.enabled ||
    users.createRule === null ||
    users.createRule === undefined ||
    users.otp?.length !== 6

  if (needsPatch) {
    const patch = await fetch(`${config.adminUrl}/api/collections/${users.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        otp: { enabled: true, duration: 300, length: 6 },
        createRule: users.createRule === '' ? desiredCreate : users.createRule || desiredCreate,
      }),
    })
    if (!patch.ok) {
      // Fallback: empty createRule (OTP still works) if expression rejected
      const fallback = await fetch(`${config.adminUrl}/api/collections/${users.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          otp: { enabled: true, duration: 300, length: 6 },
          createRule: '',
        }),
      })
      if (!fallback.ok) {
        const err = (await patch.json().catch(() => ({}))) as { message?: string }
        throw new Error(err.message || 'Failed to enable Indobase backend OTP')
      }
    }
  }
}

export async function managedBackendOtpStart(input: {
  name: string
  email: string
}): Promise<{ ok: true; email: string } | { ok: false; status: number; message: string }> {
  const config = getManagedBackendConfig()
  if (!config) {
    return { ok: false, status: 503, message: 'Indobase backend is not configured' }
  }

  const email = input.email.trim().toLowerCase()
  try {
    await ensureAuthCollectionReady(config)
    const response = await fetch(`${config.adminUrl}/api/collections/users/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const payload = (await response.json().catch(() => ({}))) as {
      otpId?: string
      message?: string
    }
    if (!response.ok || !payload.otpId) {
      return {
        ok: false,
        status: response.status >= 400 ? response.status : 502,
        message: payload.message || 'Could not send sign-in code',
      }
    }
    await rememberOtp({ email, otpId: payload.otpId, name: input.name })
    return { ok: true, email }
  } catch (error) {
    return {
      ok: false,
      status: 502,
      message: error instanceof Error ? error.message : 'Could not send sign-in code',
    }
  }
}

export async function managedBackendOtpVerify(input: {
  name: string
  email: string
  token: string
}): Promise<
  | { ok: true; session: OsWorkspaceSession }
  | { ok: false; status: number; message: string }
> {
  const config = getManagedBackendConfig()
  if (!config) {
    return { ok: false, status: 503, message: 'Indobase backend is not configured' }
  }

  const email = input.email.trim().toLowerCase()
  const pending = await peekOtp(email)
  if (!pending?.otpId) {
    return {
      ok: false,
      status: 401,
      message: 'No active sign-in code for this email. Request a new code.',
    }
  }

  try {
    const response = await fetch(`${config.adminUrl}/api/collections/users/auth-with-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        otpId: pending.otpId,
        otp: input.token.trim(),
      }),
    })
    const payload = (await response.json().catch(() => ({}))) as {
      token?: string
      record?: { id?: string; email?: string; name?: string }
      message?: string
    }

    if (!response.ok || !payload.token || !payload.record?.id) {
      return {
        ok: false,
        status: 401,
        message: payload.message || 'Invalid or expired verification code',
      }
    }

    await consumeOtp(email, pending.otpId)

    const userId = payload.record.id
    const verifiedEmail = (payload.record.email || email).trim().toLowerCase()
    const appId = createAppId(verifiedEmail)
    const ensured = await ensureManagedBackend({ appId, seed: verifiedEmail })
    const workspaceName =
      input.name.trim() || payload.record.name?.trim() || verifiedEmail.split('@')[0] || 'My business'

    const session: OsWorkspaceSession = {
      gotrue_id: userId,
      email: verifiedEmail,
      workspace_ref: ensured.appId,
      organization_slug: 'indobase',
      workspace_name: workspaceName,
      provision_state: 'ready',
      backend: ensured.backend,
    }

    return { ok: true, session }
  } catch (error) {
    return {
      ok: false,
      status: 502,
      message: error instanceof Error ? error.message : 'Verification failed',
    }
  }
}
