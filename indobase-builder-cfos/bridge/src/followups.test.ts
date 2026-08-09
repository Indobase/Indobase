import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  parseFollowUps,
  resolveFollowUps,
  looksLikeCompletedDeliverable,
  looksLikePaymentsPending,
  looksLikePaymentsLive,
  looksLikePaymentsMarketAsk,
  DEFAULT_POST_BUILD_FOLLOWUPS,
  PAYMENTS_SETUP_FOLLOWUPS,
  PAYMENTS_LIVE_FOLLOWUPS,
  PAYMENTS_MARKET_FOLLOWUPS,
  SHOP_BACKEND_FOLLOWUPS,
  looksLikeShopBackendReady,
} from './followups.ts'

describe('followups parser', () => {
  it('parses titled follow-up blocks and strips them from the body', () => {
    const input = `Store is ready.

<<<INDOBASE_FOLLOWUPS
title: Where should I take MERIDIAN next?
Go Live on Indobase | Go Live now
Refine the design | Polish branding
Leave it as-is for now
INDOBASE_FOLLOWUPS>>>
`
    const parsed = parseFollowUps(input)
    assert.ok(parsed)
    assert.equal(parsed.title, 'Where should I take MERIDIAN next?')
    assert.equal(parsed.items.length, 3)
    assert.equal(parsed.items[0].label, 'Go Live on Indobase')
    assert.equal(parsed.items[0].message, 'Go Live now')
    assert.equal(parsed.items[2].message, 'Leave it as-is for now')
    assert.match(parsed.body, /Store is ready/)
    assert.doesNotMatch(parsed.body, /INDOBASE_FOLLOWUPS/)
  })

  it('accepts INDOBASE_CHOICES alias for clarifying questions', () => {
    const input = `What will you sell?

<<<INDOBASE_CHOICES
title: What will your store sell?
Apparel / fashion | Apparel / fashion store
I'll type my specific niche
INDOBASE_CHOICES>>>
`
    const parsed = parseFollowUps(input)
    assert.ok(parsed)
    assert.equal(parsed.title, 'What will your store sell?')
    assert.equal(parsed.items[0].label, 'Apparel / fashion')
    assert.equal(parsed.items[1].message, "I'll type my specific niche")
  })

  it('falls back to Indobase defaults after a completed deliverable', () => {
    const input =
      'MERIDIAN — live preview\nhttps://demo.sites.indobase.in\nWhere do you want to take it next?'
    assert.equal(looksLikeCompletedDeliverable(input), true)
    const resolved = resolveFollowUps(input)
    assert.ok(resolved)
    assert.equal(resolved.items.length, DEFAULT_POST_BUILD_FOLLOWUPS.length)
    assert.ok(resolved.items.some((i) => /Go Live/i.test(i.label)))
    assert.ok(resolved.items.some((i) => i.label === 'Add payments'))
    assert.ok(resolved.items.some((i) => i.label === 'Add a real backend'))
    assert.ok(resolved.items.some((i) => i.label === 'Production checklist'))
    assert.ok(!resolved.items.some((i) => /vercel/i.test(i.label + i.message)))
  })

  it('shows shop-backend chips after catalog is ready', () => {
    const input = 'Shop catalog ready — 8 products. Test order ORD-ABC verified.'
    assert.equal(looksLikeShopBackendReady(input), true)
    const resolved = resolveFollowUps(input)
    assert.ok(resolved)
    assert.equal(resolved.items.length, SHOP_BACKEND_FOLLOWUPS.length)
    assert.ok(resolved.items.some((i) => i.label === 'Publish admin dashboard'))
  })

  it('asks India (Razorpay) vs International (Stripe) before ensure', () => {
    const input = 'Where will customers pay — India (Razorpay) or International (Stripe)?'
    assert.equal(looksLikePaymentsMarketAsk(input), true)
    const resolved = resolveFollowUps(input)
    assert.ok(resolved)
    assert.equal(resolved.title, 'Where will customers pay?')
    assert.equal(resolved.items.length, PAYMENTS_MARKET_FOLLOWUPS.length)
    assert.ok(resolved.items.some((i) => i.label === 'India (Razorpay)'))
    assert.ok(resolved.items.some((i) => i.label === 'International (Stripe)'))
    assert.ok(resolved.items.some((i) => /settlement_market.*india/i.test(i.message)))
    assert.ok(resolved.items.some((i) => /settlement_market.*international/i.test(i.message)))
  })

  it('shows payments setup wall after Enable payments pending', () => {
    const input =
      'Payments backend is ready — finish checkout setup to charge customers. India settlements selected.\nlaunch_url: https://dashboard.razorpay.com/app/keys'
    assert.equal(looksLikePaymentsPending(input), true)
    assert.equal(looksLikeCompletedDeliverable(input), false)
    const resolved = resolveFollowUps(input)
    assert.ok(resolved)
    assert.equal(resolved.title, 'Finish payments setup')
    assert.equal(resolved.items.length, PAYMENTS_SETUP_FOLLOWUPS.length)
    assert.ok(resolved.items.some((i) => i.label === 'Complete KYC on Razorpay/Stripe'))
    assert.ok(resolved.items.some((i) => i.label === 'Paste API keys'))
    assert.ok(resolved.items.some((i) => i.label === 'Wire checkout into the site'))
    assert.ok(resolved.items.some((i) => /wireCheckout/i.test(i.message)))
  })

  it('shows payments-live chips when KYC verified', () => {
    const input = 'Payments are live. International cards selected.'
    assert.equal(looksLikePaymentsLive(input), true)
    const resolved = resolveFollowUps(input)
    assert.ok(resolved)
    assert.equal(resolved.title, 'Payments are live — what next?')
    assert.equal(resolved.items.length, PAYMENTS_LIVE_FOLLOWUPS.length)
    assert.ok(resolved.items.some((i) => i.label === 'Wire checkout into the site'))
    assert.ok(resolved.items.some((i) => i.label === 'Production checklist'))
    assert.ok(resolved.items.some((i) => /wireCheckout/i.test(i.message)))
  })

  it('does not invent chips for ordinary questions', () => {
    assert.equal(resolveFollowUps('What color should the logo be?'), null)
  })
})
