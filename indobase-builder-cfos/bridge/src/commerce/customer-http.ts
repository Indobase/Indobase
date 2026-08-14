/**
 * V1.1 customer HTTP — OTP, session, order history.
 * Not an agent tool surface.
 */
import type { Context } from 'hono'

import {
  SESSION_COOKIE,
  isGuestSession,
  readCookie,
  readSessionToken,
  resolveHandoffSecret,
} from '../auth.js'
import { sanitizeAppId } from '../pocketbase/managed.js'
import { resolveTenantProjectRef } from './control-center-auth.js'
import { canViewOrder, verifyCustomerSession } from './customer-identity.js'
import { getOrderOwnership, listOrdersForCustomer } from './customer-pb.js'
import { startCustomerOtp, verifyCustomerOtp } from './customer-service.js'
import { getOrderRecord } from './pb-adapter.js'

function commerceCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Idempotency-Key, Authorization, X-Indobase-Project-Ref, X-Indobase-Customer-Token, X-Indobase-Guest-Token',
    'Access-Control-Max-Age': '86400',
  }
}

function clientProjectRefFrom(c: Context, body?: Record<string, unknown>): string {
  const header = c.req.header('X-Indobase-Project-Ref') || ''
  const q = c.req.query('projectRef') || ''
  const b = typeof body?.projectRef === 'string' ? body.projectRef : ''
  return sanitizeAppId(header || q || b)
}

function bindCustomerProjectRef(c: Context, body?: Record<string, unknown>) {
  try {
    const secret = resolveHandoffSecret()
    const raw = readCookie(c.req.header('cookie'), SESSION_COOKIE)
    const session = raw ? readSessionToken(raw, secret) : null
    return resolveTenantProjectRef({
      session,
      guest: session ? isGuestSession(session) : false,
      clientProjectRef: clientProjectRefFrom(c, body),
      allowAnonymousClient: true,
    })
  } catch {
    return resolveTenantProjectRef({
      session: null,
      clientProjectRef: clientProjectRefFrom(c, body),
      allowAnonymousClient: true,
    })
  }
}

export function customerTokenFrom(c: Context): string {
  const header = (c.req.header('Authorization') || '').trim()
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim()
  return (c.req.header('X-Indobase-Customer-Token') || '').trim()
}

export function sessionFromRequest(c: Context, projectRef: string) {
  return verifyCustomerSession(customerTokenFrom(c), projectRef)
}

export async function handleCustomerOtpStart(c: Context) {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const bound = bindCustomerProjectRef(c, body)
  if (!bound.ok) {
    return c.json({ ok: false, code: bound.code }, bound.status, commerceCorsHeaders())
  }
  const projectRef = bound.projectRef
  const email = typeof body.email === 'string' ? body.email : ''
  const name = typeof body.name === 'string' ? body.name : undefined
  if (!projectRef || !email) {
    return c.json({ ok: false, code: 'invalid_request', message: 'projectRef and email required' }, 400, commerceCorsHeaders())
  }
  const result = await startCustomerOtp({ projectRef, email, name })
  return c.json(result, result.ok ? 200 : 400, commerceCorsHeaders())
}

export async function handleCustomerOtpVerify(c: Context) {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const bound = bindCustomerProjectRef(c, body)
  if (!bound.ok) {
    return c.json({ ok: false, code: bound.code }, bound.status, commerceCorsHeaders())
  }
  const projectRef = bound.projectRef
  const email = typeof body.email === 'string' ? body.email : ''
  const code = typeof body.code === 'string' ? body.code : typeof body.token === 'string' ? body.token : ''
  const name = typeof body.name === 'string' ? body.name : undefined
  if (!projectRef || !email || !code) {
    return c.json({ ok: false, code: 'invalid_request', message: 'projectRef, email, and code required' }, 400, commerceCorsHeaders())
  }
  try {
    const result = await verifyCustomerOtp({ projectRef, email, code, name })
    return c.json(result, result.ok ? 200 : 400, commerceCorsHeaders())
  } catch (err) {
    return c.json(
      { ok: false, code: 'backend_unavailable', message: err instanceof Error ? err.message : 'Verify failed' },
      502,
      commerceCorsHeaders(),
    )
  }
}

export async function handleCustomerMe(c: Context) {
  const bound = bindCustomerProjectRef(c)
  if (!bound.ok) {
    return c.json({ ok: false, code: bound.code }, bound.status, commerceCorsHeaders())
  }
  const projectRef = bound.projectRef
  const session = sessionFromRequest(c, projectRef)
  if (!session) {
    return c.json({ ok: true, authenticated: false }, 200, commerceCorsHeaders())
  }
  return c.json(
    {
      ok: true,
      authenticated: true,
      customer: {
        id: session.customerId,
        email: session.email,
        name: session.name,
        projectRef: session.projectRef,
      },
    },
    200,
    commerceCorsHeaders(),
  )
}

export async function handleCustomerLogout(c: Context) {
  return c.json({ ok: true, authenticated: false, message: 'Session cleared on client' }, 200, commerceCorsHeaders())
}

export async function handleCustomerOrdersList(c: Context) {
  const bound = bindCustomerProjectRef(c)
  if (!bound.ok) {
    return c.json({ ok: false, code: bound.code }, bound.status, commerceCorsHeaders())
  }
  const projectRef = bound.projectRef
  const session = sessionFromRequest(c, projectRef)
  if (!session) {
    return c.json({ ok: false, code: 'unauthorized', message: 'Sign in to view your orders' }, 401, commerceCorsHeaders())
  }
  try {
    const orders = await listOrdersForCustomer(projectRef, session.customerId)
    return c.json(
      {
        ok: true,
        orders: orders.map((o) => ({
          id: o.id,
          status: o.status,
          paymentStatus: o.payment_status || 'pending',
          fulfillmentStatus: o.fulfillment_status || 'unfulfilled',
          email: o.email,
          total: o.total,
          amountMinor: o.amount_minor ?? Math.round(Number(o.total || 0) * 100),
          currency: o.currency || 'INR',
          customerId: o.customer_id,
        })),
      },
      200,
      commerceCorsHeaders(),
    )
  } catch (err) {
    return c.json(
      { ok: false, code: 'backend_unavailable', message: err instanceof Error ? err.message : 'List failed' },
      502,
      commerceCorsHeaders(),
    )
  }
}

export async function handleCustomerOrderGet(c: Context) {
  const bound = bindCustomerProjectRef(c)
  if (!bound.ok) {
    return c.json({ ok: false, code: bound.code }, bound.status, commerceCorsHeaders())
  }
  const projectRef = bound.projectRef
  const orderId = c.req.param('id') || c.req.query('orderId') || ''
  const guestToken = c.req.query('guestToken') || c.req.header('X-Indobase-Guest-Token') || ''
  if (!orderId) {
    return c.json({ ok: false, code: 'invalid_request', message: 'projectRef and order id required' }, 400, commerceCorsHeaders())
  }
  try {
    const ownership = await getOrderOwnership(projectRef, orderId)
    if (!ownership) {
      return c.json({ ok: false, code: 'invalid_request', message: 'Order not found' }, 404, commerceCorsHeaders())
    }
    const session = sessionFromRequest(c, projectRef)
    if (!canViewOrder({ order: ownership, session, guestToken })) {
      return c.json({ ok: false, code: 'unauthorized', message: 'Not allowed to view this order' }, 403, commerceCorsHeaders())
    }
    const order = await getOrderRecord(projectRef, orderId)
    return c.json(
      {
        ok: true,
        order: {
          id: order?.id,
          status: order?.status,
          paymentStatus: order?.payment_status || 'pending',
          fulfillmentStatus: order?.fulfillment_status || 'unfulfilled',
          email: order?.email,
          currency: order?.currency,
          amountMinor: order?.amount_minor ?? Math.round(Number(order?.total || 0) * 100),
          total: order?.total,
          customerId: ownership.customerId,
          customerType: ownership.customerType,
        },
      },
      200,
      commerceCorsHeaders(),
    )
  } catch (err) {
    return c.json(
      { ok: false, code: 'backend_unavailable', message: err instanceof Error ? err.message : 'Get failed' },
      502,
      commerceCorsHeaders(),
    )
  }
}
