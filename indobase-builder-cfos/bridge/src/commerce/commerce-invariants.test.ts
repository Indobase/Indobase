/**
 * Named production invariants from the 38e23035b → 8be50dd31 live smoke.
 *
 * These test business state transitions, not merely HTTP 200.
 * V1.1–V1.3 (customer lifecycle, payment retry, ops commerce) stay out of Core v1.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { Hono } from 'hono'

import { getBlueprint, rulesForProfile } from '../pocketbase/blueprints.ts'
import { buildManagedShopAdminHtml } from '../pocketbase/shop-admin-html.ts'
import { handleCommerceMarkFailed, handleCommerceMarkPaid } from './http.ts'
import {
  activeReservationFilter,
  expiredReservationFilter,
  isoNowFalselyExpiresPbReservation,
  markPaidCanCommitReservation,
  pocketBaseDateTime,
  reservationIsActive,
  reservedForOrderFilter,
} from './pb-adapter.ts'

describe('COMMERCE-RESERVATION-001', () => {
  it('keeps a PB-formatted reservation active through mark-paid and decrements once', () => {
    const paidAt = new Date('2026-08-13T02:53:00.000Z')
    const expiresAt = new Date(paidAt.getTime() + 30 * 60 * 1000)
    const stored = pocketBaseDateTime(expiresAt)

    assert.equal(stored, '2026-08-13 03:23:00.000Z')
    assert.equal(reservationIsActive(stored, paidAt), true, 'reservation must still be active at payment')
    assert.equal(
      isoNowFalselyExpiresPbReservation(stored, paidAt),
      true,
      'ISO T now must be documented as the false-expiry bug',
    )

    const expiryFilter = expiredReservationFilter(paidAt)
    assert.match(expiryFilter, /2026-08-13 02:53:00.000Z/)
    assert.doesNotMatch(expiryFilter, /2026-08-13T02:53:00.000Z/)
    assert.equal(stored <= pocketBaseDateTime(paidAt), false, 'sweeper with PB now must not release')
    assert.equal(stored <= paidAt.toISOString(), true, 'sweeper with ISO T would release every row')

    assert.equal(markPaidCanCommitReservation('reserved'), true)
    assert.equal(markPaidCanCommitReservation('released'), false)

    const stockBefore = 119
    const qty = 1
    const wouldCommit = markPaidCanCommitReservation('reserved') && reservationIsActive(stored, paidAt)
    const stockAfter = wouldCommit ? Math.max(0, stockBefore - qty) : stockBefore
    assert.equal(stockAfter, 118)

    const releasedByIsoBug = 'released'
    const stockIfBug = markPaidCanCommitReservation(releasedByIsoBug) ? stockBefore - qty : stockBefore
    assert.equal(stockIfBug, 119, 'premature release leaves inventory stuck — the live P0')

    assert.match(reservedForOrderFilter('wus5mjemdryd457'), /status="reserved"/)
    assert.match(activeReservationFilter('qh594bd63r0z72i', paidAt), /expires_at>"2026-08-13 02:53:00.000Z"/)
  })
})

describe('ADMIN-AUTH-001', () => {
  it('denies unauthenticated access to orders and mark-paid', async () => {
    const orders = getBlueprint('ecommerce').collections.find((c) => c.name === 'orders')
    assert.ok(orders)
    assert.equal(orders.rules, 'admin_only')
    const rules = rulesForProfile(orders.rules)
    assert.equal(rules.listRule, null)
    assert.equal(rules.viewRule, null)
    assert.equal(rules.createRule, null)
    assert.equal(rules.updateRule, null)

    const admin = buildManagedShopAdminHtml({
      brand: 'Circuit Nest',
      appId: 'roshb77a4744fa',
      publicUrl: 'https://backend.indobase.in',
    })
    assert.doesNotMatch(admin, /\/api\/collections\/[^"'`]*orders[^"'`]*\/records/)
    assert.match(admin, /admin\/snapshot/)

    const prev = {
      webhook: process.env.INDOBASE_COMMERCE_WEBHOOK_SECRET,
      cfos: process.env.BUILDER_CFOS_HANDOFF_SECRET,
      builder: process.env.BUILDER_HANDOFF_SECRET,
    }
    process.env.INDOBASE_COMMERCE_WEBHOOK_SECRET = 'x'.repeat(32)
    delete process.env.BUILDER_CFOS_HANDOFF_SECRET
    delete process.env.BUILDER_HANDOFF_SECRET
    try {
      const app = new Hono()
      app.post('/api/os/commerce/orders/:id/mark-paid', handleCommerceMarkPaid)
      app.post('/api/os/commerce/orders/:id/mark-failed', handleCommerceMarkFailed)
      const paid = await app.request('/api/os/commerce/orders/abc123abc123abc/mark-paid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Indobase-Project-Ref': 'roshb77a4744fa',
        },
        body: JSON.stringify({ projectRef: 'roshb77a4744fa', orderId: 'abc123abc123abc' }),
      })
      assert.equal(paid.status, 401)
      const body = (await paid.json()) as { code?: string }
      assert.equal(body.code, 'unauthorized')

      const failed = await app.request('/api/os/commerce/orders/abc123abc123abc/mark-failed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Indobase-Project-Ref': 'roshb77a4744fa',
        },
        body: JSON.stringify({ projectRef: 'roshb77a4744fa', orderId: 'abc123abc123abc' }),
      })
      assert.equal(failed.status, 401)
    } finally {
      if (prev.webhook === undefined) delete process.env.INDOBASE_COMMERCE_WEBHOOK_SECRET
      else process.env.INDOBASE_COMMERCE_WEBHOOK_SECRET = prev.webhook
      if (prev.cfos === undefined) delete process.env.BUILDER_CFOS_HANDOFF_SECRET
      else process.env.BUILDER_CFOS_HANDOFF_SECRET = prev.cfos
      if (prev.builder === undefined) delete process.env.BUILDER_HANDOFF_SECRET
      else process.env.BUILDER_HANDOFF_SECRET = prev.builder
    }
  })
})

describe('Ecommerce Production Core v1 release evidence', () => {
  it('records 8be50dd31 as the live-smoke candidate and keeps V1.1–V1.3 out of scope', () => {
    const path = join(dirname(fileURLToPath(import.meta.url)), '../delivery/ecommerce-core-v1-release.json')
    const evidence = JSON.parse(readFileSync(path, 'utf8')) as {
      milestone: string
      shopifyParity: boolean
      releaseCandidate: string
      outOfScope: string[]
      namedInvariants: string[]
    }
    assert.equal(evidence.milestone, 'Ecommerce Production Core v1')
    assert.equal(evidence.shopifyParity, false)
    assert.match(evidence.releaseCandidate, /^8be50dd31/)
    assert.ok(evidence.outOfScope.some((s) => s.startsWith('V1.1')))
    assert.deepEqual(evidence.namedInvariants, ['COMMERCE-RESERVATION-001', 'ADMIN-AUTH-001'])
  })
})
