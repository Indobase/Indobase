import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { Hono } from 'hono'

import {
  handleCustomerLogout,
  handleCustomerMe,
  handleCustomerOrdersList,
  handleCustomerOtpStart,
} from './customer-http.ts'
import { signCustomerSession } from './customer-identity.ts'

describe('V1.1 customer HTTP', () => {
  const secret = 'customer-http-test-secret-32chars!!'
  const prev = {
    customer: process.env.INDOBASE_CUSTOMER_SESSION_SECRET,
    cfos: process.env.BUILDER_CFOS_HANDOFF_SECRET,
    builder: process.env.BUILDER_HANDOFF_SECRET,
  }

  beforeEach(() => {
    process.env.INDOBASE_CUSTOMER_SESSION_SECRET = secret
    delete process.env.BUILDER_CFOS_HANDOFF_SECRET
    delete process.env.BUILDER_HANDOFF_SECRET
  })

  afterEach(() => {
    if (prev.customer === undefined) delete process.env.INDOBASE_CUSTOMER_SESSION_SECRET
    else process.env.INDOBASE_CUSTOMER_SESSION_SECRET = prev.customer
    if (prev.cfos === undefined) delete process.env.BUILDER_CFOS_HANDOFF_SECRET
    else process.env.BUILDER_CFOS_HANDOFF_SECRET = prev.cfos
    if (prev.builder === undefined) delete process.env.BUILDER_HANDOFF_SECRET
    else process.env.BUILDER_HANDOFF_SECRET = prev.builder
  })

  function app() {
    const hono = new Hono()
    hono.post('/api/os/commerce/customer/otp/start', handleCustomerOtpStart)
    hono.post('/api/os/commerce/customer/logout', handleCustomerLogout)
    hono.get('/api/os/commerce/customer/me', handleCustomerMe)
    hono.get('/api/os/commerce/customer/orders', handleCustomerOrdersList)
    return hono
  }

  it('allows anonymous session probe and denies order history without login', async () => {
    const api = app()
    const me = await api.request('/api/os/commerce/customer/me?projectRef=shop01', {
      headers: { 'X-Indobase-Project-Ref': 'shop01' },
    })
    assert.equal(me.status, 200)
    const meBody = (await me.json()) as { authenticated?: boolean }
    assert.equal(meBody.authenticated, false)

    const orders = await api.request('/api/os/commerce/customer/orders?projectRef=shop01', {
      headers: { 'X-Indobase-Project-Ref': 'shop01' },
    })
    assert.equal(orders.status, 401)
  })

  it('rejects invalid OTP email without touching PocketBase', async () => {
    const api = app()
    const res = await api.request('/api/os/commerce/customer/otp/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Indobase-Project-Ref': 'shop01' },
      body: JSON.stringify({ projectRef: 'shop01', email: 'not-an-email' }),
    })
    assert.equal(res.status, 400)
  })

  it('logout is a client discard — session JWT is not a denylist', async () => {
    const token = signCustomerSession({
      projectRef: 'shop01',
      customerId: 'cust01cust01cust',
      authIdentityId: 'auth01auth01auth',
      email: 'a@example.com',
      name: 'A',
      emailVerified: true,
    })
    const api = app()
    const loggedOut = await api.request('/api/os/commerce/customer/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Indobase-Project-Ref': 'shop01',
      },
      body: JSON.stringify({ projectRef: 'shop01' }),
    })
    assert.equal(loggedOut.status, 200)

    const me = await api.request('/api/os/commerce/customer/me?projectRef=shop01', {
      headers: { Authorization: `Bearer ${token}`, 'X-Indobase-Project-Ref': 'shop01' },
    })
    const body = (await me.json()) as { authenticated?: boolean }
    assert.equal(body.authenticated, true, 'stateless JWT remains valid until the client drops it')
  })
})
