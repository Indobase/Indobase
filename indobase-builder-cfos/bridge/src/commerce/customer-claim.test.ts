/**
 * CUSTOMER-007 attack suite — email is not proof of ownership.
 */
import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import {
  applyGuestOrderClaim,
  evaluateGuestOrderClaim,
  issueGuestToken,
  newCustomerId,
  type GuestClaimant,
  type OrderOwnership,
} from './customer-identity.ts'

function guestOrder(input: { projectRef: string; email: string; customerId?: string }): OrderOwnership {
  const guest = issueGuestToken()
  return {
    orderId: newCustomerId(),
    projectRef: input.projectRef,
    customerId: input.customerId || newCustomerId(),
    customerType: 'guest',
    email: input.email,
    guestTokenHash: guest.hash,
  }
}

function claimant(input: Partial<GuestClaimant> & { email: string }): GuestClaimant {
  return {
    customerId: input.customerId || newCustomerId(),
    projectRef: input.projectRef || 'shop1',
    email: input.email,
    emailVerified: input.emailVerified === true,
  }
}

describe('CUSTOMER-007 verified email claim', () => {
  beforeEach(() => {
    process.env.BUILDER_CFOS_HANDOFF_SECRET = 'x'.repeat(32)
  })

  it('unverified account MUST NOT claim', () => {
    const order = guestOrder({ projectRef: 'shop1', email: 'person@example.com' })
    const result = evaluateGuestOrderClaim(
      order,
      claimant({ email: 'person@example.com', emailVerified: false }),
    )
    assert.deepEqual(result, { ok: false, reason: 'unverified' })
  })

  it('verified same email MAY claim', () => {
    const order = guestOrder({ projectRef: 'shop1', email: 'Person@example.com' })
    const who = claimant({ email: ' person@example.com ', emailVerified: true })
    const applied = applyGuestOrderClaim(order, who)
    assert.equal(applied.result.ok, true)
    if (applied.result.ok) assert.equal(applied.result.outcome, 'claimed')
    assert.equal(applied.order.customerId, who.customerId)
    assert.equal(applied.order.customerType, 'registered')
    assert.equal(applied.order.guestTokenHash, undefined)
  })

  it('different email MUST NOT claim', () => {
    const order = guestOrder({ projectRef: 'shop1', email: 'owner@example.com' })
    const result = evaluateGuestOrderClaim(
      order,
      claimant({ email: 'attacker@example.com', emailVerified: true }),
    )
    assert.deepEqual(result, { ok: false, reason: 'email_mismatch' })
  })

  it('same email different tenant MUST NOT claim', () => {
    const order = guestOrder({ projectRef: 'shop1', email: 'person@example.com' })
    const result = evaluateGuestOrderClaim(
      order,
      claimant({ projectRef: 'shop2', email: 'person@example.com', emailVerified: true }),
    )
    assert.deepEqual(result, { ok: false, reason: 'cross_tenant' })
  })

  it('same email concurrent claim is idempotent', () => {
    const order = guestOrder({ projectRef: 'shop1', email: 'person@example.com' })
    const who = claimant({ email: 'person@example.com', emailVerified: true })
    const first = applyGuestOrderClaim(order, who)
    const second = applyGuestOrderClaim(first.order, who)
    assert.equal(first.result.ok && first.result.outcome, 'claimed')
    assert.equal(second.result.ok && second.result.outcome, 'already_owned')
    assert.equal(second.order.customerId, who.customerId)
    assert.equal(second.order.customerType, 'registered')
  })

  it('already claimed order MUST NOT duplicate or steal ownership', () => {
    const order = guestOrder({ projectRef: 'shop1', email: 'person@example.com' })
    const owner = claimant({ email: 'person@example.com', emailVerified: true })
    const other = claimant({ email: 'person@example.com', emailVerified: true })
    const owned = applyGuestOrderClaim(order, owner).order
    const steal = applyGuestOrderClaim(owned, other)
    assert.deepEqual(steal.result, { ok: false, reason: 'already_claimed_by_other' })
    assert.equal(steal.order.customerId, owner.customerId)
  })

  it('missing claimant MUST NOT claim', () => {
    const order = guestOrder({ projectRef: 'shop1', email: 'person@example.com' })
    assert.deepEqual(evaluateGuestOrderClaim(order, null), { ok: false, reason: 'missing_claimant' })
  })
})
