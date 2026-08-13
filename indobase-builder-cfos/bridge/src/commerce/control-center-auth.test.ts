import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { Hono } from 'hono'

import {
  AUDIENCE,
  SESSION_COOKIE,
  createGuestSession,
  createSessionToken,
  type Session,
} from '../auth.ts'
import { authorizeControlCenterAccess, sameProjectRef } from './control-center-auth.ts'
import { handleCommerceAdminSnapshot } from './http.ts'

const SECRET = 'control-center-test-secret-32chars!!'

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function signExpired(session: Session): string {
  const now = Math.floor(Date.now() / 1000)
  const payload = { ...session, exp: now - 60, iat: now - 120, aud: AUDIENCE }
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const data = `${header}.${body}`
  const sig = createHmac('sha256', SECRET).update(data).digest()
  return `${data}.${b64url(sig)}`
}

function member(projectRef: string): Session {
  return {
    gotrueId: `user-${projectRef}`,
    email: `${projectRef}@indobase.in`,
    projectRef,
    orgSlug: 'acme',
    projectName: 'Shop',
    studioUrl: 'https://studio.indobase.in',
  }
}

describe('Control Center authorization', () => {
  it('anonymous and missing session are 401', () => {
    assert.deepEqual(authorizeControlCenterAccess({ session: null }), {
      ok: false,
      status: 401,
      code: 'unauthorized',
    })
    assert.deepEqual(authorizeControlCenterAccess({ session: { projectRef: '' } }), {
      ok: false,
      status: 401,
      code: 'unauthorized',
    })
  })

  it('guest cannot open Control Center', () => {
    const guest = createGuestSession()
    assert.deepEqual(
      authorizeControlCenterAccess({ session: guest, guest: true, requestedProjectRef: guest.projectRef }),
      { ok: false, status: 403, code: 'account_required' },
    )
  })

  it('A → A is allowed; projectRef comes from the session', () => {
    const auth = authorizeControlCenterAccess({
      session: member('roshb77a4744fa'),
      requestedProjectRef: 'roshb77a4744fa',
    })
    assert.equal(auth.ok, true)
    if (auth.ok) assert.equal(auth.projectRef, 'roshb77a4744fa')
  })

  it('A → B is forbidden even if the client sends B as projectRef', () => {
    const auth = authorizeControlCenterAccess({
      session: member('roshb77a4744fa'),
      requestedProjectRef: 'v11xtenantb1',
    })
    assert.deepEqual(auth, { ok: false, status: 403, code: 'forbidden' })
  })

  it('omitted projectRef still binds to the session project', () => {
    const auth = authorizeControlCenterAccess({ session: member('roshb77a4744fa') })
    assert.equal(auth.ok, true)
    if (auth.ok) assert.equal(auth.projectRef, 'roshb77a4744fa')
  })

  it('sameProjectRef is case-insensitive and does not treat A as B', () => {
    assert.equal(sameProjectRef('RoshB77A4744FA', 'roshb77a4744fa'), true)
    assert.equal(sameProjectRef('roshb77a4744fa', 'v11xtenantb1'), false)
  })
})

describe('Control Center snapshot HTTP', () => {
  const prev = {
    cfos: process.env.BUILDER_CFOS_HANDOFF_SECRET,
    builder: process.env.BUILDER_HANDOFF_SECRET,
  }

  beforeEach(() => {
    process.env.BUILDER_CFOS_HANDOFF_SECRET = SECRET
    delete process.env.BUILDER_HANDOFF_SECRET
  })

  afterEach(() => {
    if (prev.cfos === undefined) delete process.env.BUILDER_CFOS_HANDOFF_SECRET
    else process.env.BUILDER_CFOS_HANDOFF_SECRET = prev.cfos
    if (prev.builder === undefined) delete process.env.BUILDER_HANDOFF_SECRET
    else process.env.BUILDER_HANDOFF_SECRET = prev.builder
  })

  function app(queried: string[]) {
    const hono = new Hono()
    const loaders = {
      listProducts: async (ref: string) => {
        queried.push(`products:${ref}`)
        return [{ id: 'p1', name: 'Sneaker' }]
      },
      listOrders: async (ref: string) => {
        queried.push(`orders:${ref}`)
        return [{ id: 'o1', orderNumber: '1042' }]
      },
    }
    hono.get('/api/os/commerce/admin/snapshot', (c) => handleCommerceAdminSnapshot(c, loaders))
    return hono
  }

  it('anonymous → 401 and does not query PocketBase', async () => {
    const queried: string[] = []
    const res = await app(queried).request('/api/os/commerce/admin/snapshot?projectRef=roshb77a4744fa')
    assert.equal(res.status, 401)
    assert.deepEqual(queried, [])
    const body = (await res.json()) as { code?: string }
    assert.equal(body.code, 'unauthorized')
  })

  it('A authenticated → A Control Center 200 using session project only', async () => {
    const queried: string[] = []
    const token = createSessionToken(member('roshb77a4744fa'), SECRET)
    const res = await app(queried).request('/api/os/commerce/admin/snapshot', {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    })
    assert.equal(res.status, 200)
    const body = (await res.json()) as { ok?: boolean; orders?: Array<{ orderNumber?: string }> }
    assert.equal(body.ok, true)
    assert.equal(body.orders?.[0]?.orderNumber, '1042')
    assert.deepEqual(queried, ['products:roshb77a4744fa', 'orders:roshb77a4744fa'])
  })

  it('A authenticated → B Control Center 403 and does not query B', async () => {
    const queried: string[] = []
    const token = createSessionToken(member('roshb77a4744fa'), SECRET)
    const res = await app(queried).request('/api/os/commerce/admin/snapshot?projectRef=v11xtenantb1', {
      headers: {
        cookie: `${SESSION_COOKIE}=${token}`,
        'X-Indobase-Project-Ref': 'v11xtenantb1',
      },
    })
    assert.equal(res.status, 403)
    const body = (await res.json()) as { code?: string }
    assert.equal(body.code, 'forbidden')
    assert.deepEqual(queried, [])
  })

  it('expired session → 401', async () => {
    const queried: string[] = []
    const token = signExpired(member('roshb77a4744fa'))
    const res = await app(queried).request('/api/os/commerce/admin/snapshot', {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    })
    assert.equal(res.status, 401)
    assert.deepEqual(queried, [])
  })

  it('logout (no cookie) → 401', async () => {
    const queried: string[] = []
    const res = await app(queried).request('/api/os/commerce/admin/snapshot')
    assert.equal(res.status, 401)
    assert.deepEqual(queried, [])
  })

  it('Hono next callback is not treated as snapshot loaders', async () => {
    const queried: string[] = []
    const hono = new Hono()
    const loaders = {
      listProducts: async (ref: string) => {
        queried.push(`products:${ref}`)
        return []
      },
      listOrders: async (ref: string) => {
        queried.push(`orders:${ref}`)
        return []
      },
    }
    hono.get('/api/os/commerce/admin/snapshot', (c, next) => {
      void next
      return handleCommerceAdminSnapshot(c, loaders)
    })
    const token = createSessionToken(member('roshb77a4744fa'), SECRET)
    const res = await hono.request('/api/os/commerce/admin/snapshot', {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    })
    assert.equal(res.status, 200)
    assert.deepEqual(queried, ['products:roshb77a4744fa', 'orders:roshb77a4744fa'])
  })

  it('guest session → 403', async () => {
    const queried: string[] = []
    const token = createSessionToken(createGuestSession(), SECRET)
    const res = await app(queried).request('/api/os/commerce/admin/snapshot', {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    })
    assert.equal(res.status, 403)
    const body = (await res.json()) as { code?: string }
    assert.equal(body.code, 'account_required')
    assert.deepEqual(queried, [])
  })
})
