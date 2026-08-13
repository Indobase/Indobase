/**
 * HTTP surface for Indobase Commerce capability (thin controller).
 */
import { timingSafeEqual } from 'node:crypto'

import type { Context } from 'hono'
import {
  SESSION_COOKIE,
  isGuestSession,
  readCookie,
  readSessionToken,
  resolveHandoffSecret,
} from '../auth.js'
import { sanitizeAppId } from '../pocketbase/managed.js'
import { executeCheckout, markOrderFailed, markOrderPaid } from './checkout-service.js'
import { authorizeControlCenterAccess } from './control-center-auth.js'
import { handleCustomerOrderGet, sessionFromRequest } from './customer-http.js'
import {
  getCommerceProduct,
  listCommerceOrders,
  listCommerceProducts,
} from './pb-adapter.js'
import { buildCommerceRuntimeJs } from './runtime.js'
import { minorToMajor } from './money.js'

export type ControlCenterSnapshotLoaders = {
  listProducts: (projectRef: string) => Promise<unknown>
  listOrders: (projectRef: string) => Promise<unknown>
}

const defaultSnapshotLoaders: ControlCenterSnapshotLoaders = {
  listProducts: listCommerceProducts,
  listOrders: listCommerceOrders,
}

function osSessionFromRequest(c: Context) {
  try {
    const secret = resolveHandoffSecret()
    const raw = readCookie(c.req.header('cookie'), SESSION_COOKIE)
    if (!raw) return { session: null, guest: false as const }
    const session = readSessionToken(raw, secret)
    if (!session) return { session: null, guest: false as const }
    return { session, guest: isGuestSession(session) }
  } catch {
    return { session: null, guest: false as const }
  }
}

function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/** Webhook / operator mutations must not be public. */
function commerceOperatorAuthorized(c: Context): boolean {
  const provided = (
    c.req.header('X-Indobase-Commerce-Webhook-Secret') ||
    c.req.header('X-Indobase-OS-Secret') ||
    ''
  ).trim()
  const expected = (
    process.env.INDOBASE_COMMERCE_WEBHOOK_SECRET ||
    process.env.BUILDER_CFOS_HANDOFF_SECRET ||
    process.env.BUILDER_HANDOFF_SECRET ||
    ''
  ).trim()
  if (expected.length < 32 || !provided) return false
  return timingSafeEqualString(provided, expected)
}

function projectRefFrom(c: Context, body?: Record<string, unknown>): string {
  const header = c.req.header('X-Indobase-Project-Ref') || ''
  const q = c.req.query('projectRef') || ''
  const b = typeof body?.projectRef === 'string' ? body.projectRef : ''
  return sanitizeAppId(header || q || b)
}

export function commerceCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Idempotency-Key, Authorization, X-Indobase-Project-Ref, X-Indobase-Customer-Token, X-Indobase-Guest-Token',
    'Access-Control-Max-Age': '86400',
  }
}

export async function handleCommerceOptions(c: Context) {
  return c.body(null, 204, commerceCorsHeaders())
}

export async function handleCommerceRuntimeJs(c: Context) {
  const projectRef = projectRefFrom(c)
  const bridgePublic =
    process.env.INDOBASE_BRIDGE_PUBLIC_URL?.trim() ||
    process.env.BRIDGE_PUBLIC_URL?.trim() ||
    'https://builder.indobase.in'
  const commerceBase = `${bridgePublic.replace(/\/+$/, '')}/api/os/commerce`
  const js = buildCommerceRuntimeJs({
    commerceBaseUrl: commerceBase,
    projectRef: projectRef || 'app',
  })
  return c.body(js, 200, {
    ...commerceCorsHeaders(),
    'Content-Type': 'application/javascript; charset=utf-8',
    'Cache-Control': 'public, max-age=60',
  })
}

export async function handleCommerceProductsList(c: Context) {
  const projectRef = projectRefFrom(c)
  if (!projectRef) {
    return c.json({ ok: false, code: 'invalid_request', message: 'projectRef required' }, 400, commerceCorsHeaders())
  }
  try {
    const products = await listCommerceProducts(projectRef)
    return c.json({ ok: true, products }, 200, commerceCorsHeaders())
  } catch (err) {
    return c.json(
      { ok: false, code: 'backend_unavailable', message: err instanceof Error ? err.message : 'List failed' },
      502,
      commerceCorsHeaders(),
    )
  }
}

export async function handleCommerceProductGet(c: Context) {
  const projectRef = projectRefFrom(c)
  const id = c.req.param('id') || ''
  if (!projectRef || !id) {
    return c.json({ ok: false, code: 'invalid_request', message: 'projectRef and id required' }, 400, commerceCorsHeaders())
  }
  try {
    const product = await getCommerceProduct(projectRef, id)
    if (!product) {
      return c.json({ ok: false, code: 'invalid_product', message: 'Not found' }, 404, commerceCorsHeaders())
    }
    return c.json({ ok: true, product }, 200, commerceCorsHeaders())
  } catch (err) {
    return c.json(
      { ok: false, code: 'backend_unavailable', message: err instanceof Error ? err.message : 'Get failed' },
      502,
      commerceCorsHeaders(),
    )
  }
}

export async function handleCommerceCheckout(c: Context) {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const projectRef = projectRefFrom(c, body)
  const idempotencyKey =
    c.req.header('Idempotency-Key') ||
    (typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '')

  const customer =
    body.customer && typeof body.customer === 'object'
      ? (body.customer as { email?: string; name?: string; phone?: string })
      : { email: typeof body.email === 'string' ? body.email : '' }

  const items = Array.isArray(body.items) ? body.items : []

  const result = await executeCheckout({
    projectRef,
    customerSession: sessionFromRequest(c, projectRef),
    idempotencyKey,
    items: items.map((it) => {
      const row = it && typeof it === 'object' ? (it as Record<string, unknown>) : {}
      return {
        productId: String(row.productId || row.product_id || ''),
        quantity: Number(row.quantity || 0),
      }
    }),
    customer: {
      email: String(customer.email || ''),
      name: customer.name ? String(customer.name) : undefined,
      phone: customer.phone ? String(customer.phone) : undefined,
    },
    shippingAddress:
      body.shippingAddress && typeof body.shippingAddress === 'object'
        ? (body.shippingAddress as {
            line1?: string
            city?: string
            state?: string
            postalCode?: string
            country?: string
          })
        : undefined,
    returnUrl: typeof body.returnUrl === 'string' ? body.returnUrl : undefined,
  })

  if (!result.ok) {
    const status =
      result.code === 'out_of_stock' || result.code === 'invalid_product' || result.code === 'invalid_request'
        ? 400
        : result.code === 'gateway_not_ready'
          ? 409
          : 502
    return c.json(result, status, commerceCorsHeaders())
  }

  return c.json(
    {
      ...result,
      // Convenience major display (authority remains amountMinor)
      amount: minorToMajor(result.amountMinor, result.currency),
    },
    200,
    commerceCorsHeaders(),
  )
}

export async function handleCommerceOrderGet(c: Context) {
  return handleCustomerOrderGet(c)
}

/** Merchant Control Center snapshot — OS session bound; never a public projectRef selector. */
export async function handleCommerceAdminSnapshot(
  c: Context,
  loaders?: ControlCenterSnapshotLoaders,
) {
  const snapshotLoaders =
    loaders && typeof loaders.listProducts === 'function' ? loaders : defaultSnapshotLoaders
  const { session, guest } = osSessionFromRequest(c)
  const requested = c.req.query('projectRef') || c.req.header('X-Indobase-Project-Ref') || ''
  const auth = authorizeControlCenterAccess({
    session,
    guest,
    requestedProjectRef: requested,
  })
  if (!auth.ok) {
    return c.json({ ok: false, code: auth.code }, auth.status, commerceCorsHeaders())
  }
  try {
    const [products, orders] = await Promise.all([
      snapshotLoaders.listProducts(auth.projectRef),
      snapshotLoaders.listOrders(auth.projectRef),
    ])
    return c.json({ ok: true, products, orders }, 200, commerceCorsHeaders())
  } catch (err) {
    return c.json(
      { ok: false, code: 'backend_unavailable', message: err instanceof Error ? err.message : 'Snapshot failed' },
      502,
      commerceCorsHeaders(),
    )
  }
}

/** Operator/webhook: mark paid. Requires commerce webhook or OS handoff secret. */
export async function handleCommerceMarkPaid(c: Context) {
  if (!commerceOperatorAuthorized(c)) {
    return c.json(
      { ok: false, code: 'unauthorized', message: 'Commerce operator secret required' },
      401,
      commerceCorsHeaders(),
    )
  }
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const projectRef = projectRefFrom(c, body)
  const orderId = typeof body.orderId === 'string' ? body.orderId : c.req.param('id') || ''
  const providerEventId =
    typeof body.providerEventId === 'string' ? body.providerEventId : undefined
  const result = await markOrderPaid({ projectRef, orderId, providerEventId })
  if (!result.ok) {
    return c.json(result, 400, commerceCorsHeaders())
  }
  return c.json(result, 200, commerceCorsHeaders())
}

export async function handleCommerceMarkFailed(c: Context) {
  if (!commerceOperatorAuthorized(c)) {
    return c.json(
      { ok: false, code: 'unauthorized', message: 'Commerce operator secret required' },
      401,
      commerceCorsHeaders(),
    )
  }
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const projectRef = projectRefFrom(c, body)
  const orderId = typeof body.orderId === 'string' ? body.orderId : c.req.param('id') || ''
  const result = await markOrderFailed({ projectRef, orderId })
  if (!result.ok) {
    return c.json(result, 400, commerceCorsHeaders())
  }
  return c.json(result, 200, commerceCorsHeaders())
}
