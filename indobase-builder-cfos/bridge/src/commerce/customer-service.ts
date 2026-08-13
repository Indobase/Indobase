/**
 * Customer OTP + checkout ownership. Platform-owned — not an agent tool.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomInt, timingSafeEqual } from 'node:crypto'

import { ensureCommerceSchema } from './pb-adapter.js'
import {
  claimGuestOrdersForEmail,
  createGuestCustomer,
  saveCustomerAddress,
  upsertRegisteredCustomer,
} from './customer-pb.js'
import {
  issueGuestToken,
  normalizeCustomerEmail,
  signCustomerSession,
  type CustomerProfile,
  type CustomerSession,
  type CustomerType,
} from './customer-identity.js'

type PendingOtp = {
  projectRef: string
  email: string
  name: string
  codeHash: string
  createdAt: string
  expiresAt: string
}

type StoreFile = { version: 1; pending: Record<string, PendingOtp> }

const TTL_MS = 10 * 60 * 1000

function storePath(): string {
  const root =
    process.env.INDOBASE_CUSTOMER_OTP_DIR?.trim() ||
    process.env.INDOBASE_LAUNCH_ROOT?.trim() ||
    path.join(process.cwd(), '.indobase-launches')
  return path.join(root, 'customer-otp.json')
}

function otpKey(projectRef: string, email: string): string {
  return `${projectRef}:${normalizeCustomerEmail(email)}`
}

function hashOtp(code: string): string {
  return createHash('sha256').update(code).digest('hex')
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

async function sendCustomerOtpEmail(email: string, code: string, brand?: string): Promise<void> {
  const apiKey =
    process.env.RESEND_API_KEY?.trim() ||
    (process.env.POCKETBASE_SMTP_PASS?.trim()?.startsWith('re_')
      ? process.env.POCKETBASE_SMTP_PASS.trim()
      : '')
  if (!apiKey) return
  const from =
    process.env.POCKETBASE_SMTP_SENDER?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    'Indobase <auth@indobase.in>'
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `${brand || 'Store'} verification code`,
      text: `Your verification code is ${code}. It expires in 10 minutes.`,
    }),
  }).catch(() => null)
}

export async function startCustomerOtp(input: {
  projectRef: string
  email: string
  name?: string
  brand?: string
}): Promise<{ ok: true; message: string; devCode?: string } | { ok: false; code: string; message: string }> {
  const email = normalizeCustomerEmail(input.email)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, code: 'invalid_request', message: 'Valid email required' }
  }
  await ensureCommerceSchema(input.projectRef)
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const now = Date.now()
  const store = prune(await readStore(), now)
  store.pending[otpKey(input.projectRef, email)] = {
    projectRef: input.projectRef,
    email,
    name: input.name || '',
    codeHash: hashOtp(code),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TTL_MS).toISOString(),
  }
  await writeStore(store)
  await sendCustomerOtpEmail(email, code, input.brand)
  const echo = process.env.INDOBASE_CUSTOMER_OTP_ECHO === '1'
  return {
    ok: true,
    message: 'We sent a verification code to your email.',
    ...(echo ? { devCode: code } : {}),
  }
}

export async function verifyCustomerOtp(input: {
  projectRef: string
  email: string
  code: string
  name?: string
}): Promise<
  | { ok: true; token: string; customer: CustomerProfile; claimedOrders: number }
  | { ok: false; code: string; message: string }
> {
  const email = normalizeCustomerEmail(input.email)
  const code = String(input.code || '').replace(/\s/g, '')
  const store = prune(await readStore())
  const pending = store.pending[otpKey(input.projectRef, email)]
  if (!pending) {
    return { ok: false, code: 'invalid_request', message: 'No pending verification for this email' }
  }
  const actual = Buffer.from(hashOtp(code))
  const expected = Buffer.from(pending.codeHash)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, code: 'invalid_request', message: 'Invalid verification code' }
  }
  delete store.pending[otpKey(input.projectRef, email)]
  await writeStore(store)

  await ensureCommerceSchema(input.projectRef)
  const customer = await upsertRegisteredCustomer({
    projectRef: input.projectRef,
    email,
    name: input.name || pending.name,
    emailVerified: true,
  })
  const claimedOrders = await claimGuestOrdersForEmail({
    projectRef: input.projectRef,
    email,
    registeredCustomerId: customer.id,
    emailVerified: true,
  })
  const token = signCustomerSession({
    projectRef: input.projectRef,
    customerId: customer.id,
    authIdentityId: customer.authIdentityId || customer.id,
    email: customer.email,
    name: customer.name,
    emailVerified: true,
  })
  return { ok: true, token, customer, claimedOrders }
}

export async function resolveCheckoutCustomer(input: {
  projectRef: string
  email: string
  name?: string
  phone?: string
  session: CustomerSession | null
  shippingAddress?: {
    line1?: string
    line2?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
  }
}): Promise<{
  customer: CustomerProfile
  customerType: CustomerType
  guestToken: string | null
  guestTokenHash: string | null
}> {
  await ensureCommerceSchema(input.projectRef)
  if (input.session && input.session.projectRef === input.projectRef) {
    await saveCustomerAddress({
      projectRef: input.projectRef,
      customerId: input.session.customerId,
      address: input.shippingAddress,
    })
    return {
      customer: {
        id: input.session.customerId,
        projectRef: input.projectRef,
        email: input.session.email,
        name: input.session.name || input.name || '',
        customerType: 'registered',
        authIdentityId: input.session.authIdentityId,
        emailVerified: input.session.emailVerified === true,
        createdAt: '',
      },
      customerType: 'registered',
      guestToken: null,
      guestTokenHash: null,
    }
  }
  const guest = await createGuestCustomer({
    projectRef: input.projectRef,
    email: input.email,
    name: input.name,
    phone: input.phone,
  })
  const token = issueGuestToken()
  await saveCustomerAddress({
    projectRef: input.projectRef,
    customerId: guest.id,
    address: input.shippingAddress,
  })
  return {
    customer: guest,
    customerType: 'guest',
    guestToken: token.token,
    guestTokenHash: token.hash,
  }
}
