import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  parseFollowUps,
  resolveFollowUps,
  looksLikeCompletedDeliverable,
  looksLikePreBuildClarification,
  formatFollowUpsBlock,
  inferChipStage,
  applyStageGate,
  MAX_VISIBLE_CHIPS,
  DEFAULT_POST_BUILD_FOLLOWUPS,
  postPreviewFollowups,
  postBackendFollowups,
  postGoLiveFollowups,
  postPaymentsFollowups,
  stripLeakedCot,
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

  it('injects Naive post-preview chips when agent omits FOLLOWUPS after a deliverable', () => {
    const input =
      "Here's what I built — MERIDIAN live preview\nhttps://demo.sites.indobase.in\nWhere do you want to take it next?"
    assert.equal(looksLikeCompletedDeliverable(input), true)
    const resolved = resolveFollowUps(input)
    assert.ok(resolved)
    assert.match(resolved.title, /MERIDIAN|next/i)
    assert.ok(resolved.items.length >= 2 && resolved.items.length <= MAX_VISIBLE_CHIPS)
    assert.ok(resolved.items.some((i) => /Go Live|Add a real backend|Refine/i.test(i.label)))
  })

  it('does not inject chips for guest-gate clarifications', () => {
    const input = 'Before I begin, please share name and email and DPDP consent.'
    assert.equal(resolveFollowUps(input), null)
  })

  it('shows agent-authored chips after a deliverable', () => {
    const input = `Here's what I built — live preview
https://aural.sites.indobase.in

<<<INDOBASE_FOLLOWUPS
title: Where should I take Aural next?
Polish the hero with product shots | Refine the hero with headphone product photography
Go Live on Indobase | Go Live — publish Aural to my Indobase subdomain
Add Buy with Razorpay | Connect India payments and wireCheckout for the Buy CTA
INDOBASE_FOLLOWUPS>>>
`
    assert.equal(inferChipStage(parseFollowUps(input)!.body), 'deliverable')
    const resolved = resolveFollowUps(input)
    assert.ok(resolved)
    assert.equal(resolved.title, 'Where should I take Aural next?')
    assert.equal(resolved.items.length, 3)
    assert.ok(resolved.items.some((i) => /product shots/i.test(i.label)))
    assert.ok(resolved.items.some((i) => /Razorpay/i.test(i.label)))
  })

  it('keeps goal-tied CHOICES the agent emits mid-build', () => {
    const input = `Two directions for the headphone landing:

<<<INDOBASE_CHOICES
title: Which direction for Aural?
Dark studio look | Dark studio aesthetic with close-up product hero
Bright lifestyle look | Bright lifestyle photos on white
I'll type my direction | I'll describe the look I want
INDOBASE_CHOICES>>>
`
    assert.equal(inferChipStage(parseFollowUps(input)!.body), 'building')
    const resolved = resolveFollowUps(input)
    assert.ok(resolved)
    assert.equal(resolved.title, 'Which direction for Aural?')
    assert.equal(resolved.items.length, 3)
  })

  it('does not invent chips for ordinary questions', () => {
    assert.equal(resolveFollowUps('What color should the logo be?'), null)
  })

  it('guest_gate stage strips post-build walls but keeps niche CHOICES', () => {
    const wall = `Clarifying guest gate needs

I can create a polished headphone product website. Before I begin, please share:

1. Name
2. Email address
3. DPDP consent

<<<INDOBASE_FOLLOWUPS
title: Where should I take this next?
Go Live on Indobase | Go Live — publish
Connect my domain | Connect domain
Add customer login | ensureLogin
Add a real backend | ensureDatabase
Add payments | payments
Production checklist | checklist
Refine the design | refine
Leave it as-is for now | leave
INDOBASE_FOLLOWUPS>>>
`
    assert.equal(looksLikePreBuildClarification(wall), true)
    const resolvedWall = resolveFollowUps(wall)
    assert.ok(resolvedWall)
    assert.equal(resolvedWall.items.length, 0)

    const niche = `I'd love to build this. Before I begin, please share name + email + DPDP.

<<<INDOBASE_CHOICES
title: What will your store sell?
Apparel / fashion | Niche Apparel — preview only, do NOT call guidedBackend yet
Electronics / gadgets | Niche Electronics — preview only
I'll type my specific niche | I'll type my niche
INDOBASE_CHOICES>>>
`
    const resolvedNiche = resolveFollowUps(niche)
    assert.ok(resolvedNiche)
    assert.equal(resolvedNiche.title, 'What will your store sell?')
    assert.ok(resolvedNiche.items.length >= 2)
  })

  it('injects niche CHOICES when agent asks niche in prose under guest gate', () => {
    const input = `I'd love to build an apparel store. Before I begin, please share name and email and DPDP consent.

What will your store sell? Streetwear, women's fashion, handmade, or electronics?`
    const resolved = resolveFollowUps(input)
    assert.ok(resolved)
    assert.equal(resolved.title, 'What will your store sell?')
    assert.ok(resolved.items.some((i) => /Apparel/i.test(i.label)))
  })

  it('strips leaked CoT from assistant body', () => {
    const dirty = `Considering guest information
I need to ask for auth before building gadgets and follow-ups.

I'd love to build this for you. Before I begin, please share name and email.`
    assert.doesNotMatch(stripLeakedCot(dirty), /Considering guest/i)
    assert.match(stripLeakedCot(dirty), /I'd love to build/i)
  })

  it('building stage strips canned post-build wall', () => {
    const input = `I'll sketch a few options for the headphone landing page.

<<<INDOBASE_FOLLOWUPS
title: Where should I take this next?
Go Live on Indobase | Go Live — publish
Connect my domain | Connect domain
Add customer login | ensureLogin
Add a real backend | ensureDatabase
Add payments | payments
Production checklist | checklist
Refine the design | refine
Leave it as-is for now | leave
INDOBASE_FOLLOWUPS>>>
`
    assert.equal(inferChipStage(parseFollowUps(input)!.body), 'building')
    const resolved = resolveFollowUps(input)
    assert.ok(resolved)
    assert.equal(resolved.items.length, 0)
    assert.match(resolved.body, /headphone landing/)
  })

  it('building stage keeps ≤4 personalized launch-ladder chips', () => {
    const input = `Polished the hero a bit — ready when you are.

<<<INDOBASE_FOLLOWUPS
title: Where should I take Aural next?
Go Live on Indobase | Go Live — publish Aural
Add a real backend | guidedBackend for Aural then Go Live
Refine then Go Live | Refine then Go Live
Add payments | Add payments after live
INDOBASE_FOLLOWUPS>>>
`
    const resolved = resolveFollowUps(input)
    assert.ok(resolved)
    assert.equal(resolved.items.length, 4)
    assert.ok(resolved.items.some((i) => /Go Live/i.test(i.label)))
  })

  it('injects post-Go Live chips when agent omits FOLLOWUPS after live url', () => {
    const input =
      "Aural is now live at https://aural.sites.indobase.in — here's the published storefront."
    const resolved = resolveFollowUps(input)
    assert.ok(resolved)
    assert.ok(resolved.items.some((i) => /payments|domain|checklist/i.test(i.label)))
  })

  it('postPreviewFollowups formats a Naive-style where-next block', () => {
    const stage = postPreviewFollowups('MERIDIAN')
    assert.equal(stage.title, 'Where should I take MERIDIAN next?')
    assert.equal(stage.items.length, 4)
    assert.ok(stage.items.some((i) => /Add a real backend/i.test(i.label)))
    assert.ok(stage.items.every((i) => !/leave it as-is/i.test(i.label)))
    const block = formatFollowUpsBlock(stage.title, stage.items)
    assert.match(block, /<<<INDOBASE_FOLLOWUPS/)
    assert.match(block, /guidedBackend/)
    const parsed = parseFollowUps(`Preview ready.\n\n${block}`)
    assert.ok(parsed)
    assert.equal(parsed.items.length, 4)
  })

  it('deliverable stage caps long agent walls at MAX_VISIBLE_CHIPS', () => {
    const block = formatFollowUpsBlock('Where should I take Aural next?', DEFAULT_POST_BUILD_FOLLOWUPS)
    const input = `Here's what I built — live preview\nhttps://aural.sites.indobase.in\n\n${block}`
    assert.equal(DEFAULT_POST_BUILD_FOLLOWUPS.length > MAX_VISIBLE_CHIPS, true)
    const resolved = resolveFollowUps(input)
    assert.ok(resolved)
    assert.equal(resolved.items.length, MAX_VISIBLE_CHIPS)
    assert.ok(resolved.items.some((i) => /Go Live/i.test(i.label)))
  })

  it('payments stage keeps market CHOICES', () => {
    const input = `Where will customers pay — India (Razorpay) or International (Stripe)?

<<<INDOBASE_CHOICES
title: Where will customers pay?
India (Razorpay) | Connect India Razorpay
International (Stripe) | Connect Stripe international
I'll describe my market | I'll describe
INDOBASE_CHOICES>>>
`
    assert.equal(inferChipStage(parseFollowUps(input)!.body), 'payments')
    const resolved = resolveFollowUps(input)
    assert.ok(resolved)
    assert.equal(resolved.items.length, 3)
  })

  it('applyStageGate is idempotent for empty guest gate', () => {
    const gated = applyStageGate({
      body: 'Before I begin, please share name and DPDP consent',
      title: 'x',
      items: [{ label: 'Go Live', message: 'go' }],
    })
    assert.equal(gated.items.length, 0)
    assert.equal(inferChipStage(gated.body), 'guest_gate')
  })

  it('does not treat vague whats-next as a completed deliverable', () => {
    assert.equal(looksLikeCompletedDeliverable("What's next?"), false)
    assert.equal(resolveFollowUps("What's next?"), null)
  })

  it('postBackendFollowups and postGoLiveFollowups stay within chip budget', () => {
    assert.ok(postBackendFollowups('Aural').items.length <= MAX_VISIBLE_CHIPS)
    assert.ok(postGoLiveFollowups('Aural').items.length <= MAX_VISIBLE_CHIPS)
    assert.ok(postBackendFollowups('Aural').items.every((i) => !/payments|razorpay/i.test(i.label)))
    assert.match(postGoLiveFollowups('Aural', { store: true }).items.map((i) => i.label).join(' '), /payments|domain|checklist/i)
  })

  it('ecommerce niche chips are preview-first (no guidedBackend on pick)', async () => {
    const { ecommerceVerticalFollowups } = await import('./vertical-catalog.ts')
    const { items } = ecommerceVerticalFollowups('MERIDIAN')
    assert.ok(items.length >= 2)
    for (const item of items) {
      assert.doesNotMatch(item.message, /INDOBASE_GUIDED_BACKEND/)
      assert.match(item.message, /preview|Do NOT call guidedBackend/i)
    }
  })
})
