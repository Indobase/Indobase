import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  parseFollowUps,
  resolveFollowUps,
  looksLikeCompletedDeliverable,
  looksLikePreBuildClarification,
  looksLikeSaaSOrBackendAppAsk,
  looksLikeAutoChainIntent,
  autoChainStoreFollowups,
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

  it('prefers the last FOLLOWUPS block when the agent emits two', () => {
    const input = `Building…

<<<INDOBASE_FOLLOWUPS
title: Where should I take this next?
Go Live on Indobase | early go live
INDOBASE_FOLLOWUPS>>>

Preview ready — what's in it: shop grid.

<<<INDOBASE_FOLLOWUPS
title: Where should I take Aural next?
Add payments | connect payments
Connect my domain | connect domain
Production checklist | checklist
INDOBASE_FOLLOWUPS>>>
`
    const parsed = parseFollowUps(input)
    assert.ok(parsed)
    assert.equal(parsed.title, 'Where should I take Aural next?')
    assert.ok(parsed.items.some((i) => /payments/i.test(i.label)))
    assert.ok(parsed.items.every((i) => !/early go live/i.test(i.message)))
    assert.doesNotMatch(parsed.body, /INDOBASE_FOLLOWUPS/)
    assert.match(parsed.body, /Preview ready/)
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

  it('guest_gate stage strips ALL chips including niche CHOICES', () => {
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
    assert.equal(resolvedNiche.items.length, 0)
  })

  it('strips chips when agent says I will build then asks name/email/DPDP', () => {
    const flower = `Great — I'll build an online flower shop with bouquets, seasonal arrangements, and gifting options. Before I start, please send:
1. Your name
2. Your email address
3. Confirmation that you agree to Indobase's Privacy Policy and Terms of Service (DPDP consent)

<<<INDOBASE_CHOICES
title: What will your store sell?
Apparel / fashion | Niche Apparel
Electronics / gadgets | Niche Electronics
Food / grocery | Niche Food
Beauty / personal care | Niche Beauty
INDOBASE_CHOICES>>>
`
    assert.equal(looksLikePreBuildClarification(flower), true)
    assert.equal(inferChipStage(flower), 'guest_gate')
    const resolved = resolveFollowUps(flower)
    assert.ok(resolved)
    assert.equal(resolved.items.length, 0)
  })

  it('does not inject niche CHOICES during guest/auth prose', () => {
    const input = `I'd love to build an apparel store. Before I begin, please share name and email and DPDP consent.

What will your store sell? Streetwear, women's fashion, handmade, or electronics?`
    const resolved = resolveFollowUps(input)
    assert.ok(!resolved || resolved.items.length === 0)
  })

  it('injects niche CHOICES after signed-in product ask (not auth gate)', () => {
    const input = `You're verified — continuing your ecommerce build.

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

  it('does not treat post-verify name/email mentions as guest_gate (keeps launch chips)', () => {
    const input = `Thanks — you are verified. Name and email are on file. Building the apparel preview next.

<<<INDOBASE_FOLLOWUPS
title: Where should I take MERIDIAN next?
Go Live on Indobase | Go Live — publish MERIDIAN
Add a real backend | guidedBackend then Go Live
Refine then Go Live | Refine then Go Live
Wire + Go Live | Wire then Go Live
INDOBASE_FOLLOWUPS>>>
`
    assert.equal(looksLikePreBuildClarification(input), false)
    const resolved = resolveFollowUps(input)
    assert.ok(resolved)
    assert.equal(resolved.items.length, 4)
    assert.ok(resolved.items.some((i) => /Go Live/i.test(i.label)))
  })

  it('still detects real guest-gate asks for name + email', () => {
    assert.equal(
      looksLikePreBuildClarification(
        "I'd love to build this. Before I begin, please share name and email and DPDP consent.",
      ),
      true,
    )
  })

  it('does not treat guest checkout / past the guest gate as guest_gate', () => {
    assert.equal(
      looksLikePreBuildClarification(
        'Added guest checkout on the first email receipt screen for the store.',
      ),
      false,
    )
    assert.equal(
      looksLikePreBuildClarification(
        "We're past the guest gate — continuing with Go Live chips for the apparel site.",
      ),
      false,
    )
  })

  it('injects launch chips after refine/polish prose without FOLLOWUPS', () => {
    const input = "I've polished the hero and refined the branding — ready when you are."
    const resolved = resolveFollowUps(input)
    assert.ok(resolved)
    assert.ok(resolved.items.some((i) => /Go Live/i.test(i.label)))
    assert.ok(resolved.items.every((i) => !/leave it as-is/i.test(i.label)))
  })

  it('does not niche-inject on generic sell copy without store intent', () => {
    const input =
      "Before I begin, please share name and email and DPDP consent. I'll help you sell your idea."
    const resolved = resolveFollowUps(input)
    // Guest gate with no store niche → no chips (null or empty items)
    assert.ok(!resolved || resolved.items.length === 0)
    if (resolved) assert.notEqual(resolved.title, 'What will your store sell?')
  })

  it('strips Leave-as-is dead-end chips from agent FOLLOWUPS', () => {
    const input = `Preview ready — what's in it: shop grid.

<<<INDOBASE_FOLLOWUPS
title: Where should I take Aural next?
Go Live on Indobase | Go Live now
Leave it as-is for now | leave
Refine then Go Live | refine then go live
INDOBASE_FOLLOWUPS>>>
`
    const resolved = resolveFollowUps(input)
    assert.ok(resolved)
    assert.ok(resolved.items.every((i) => !/leave it as-is/i.test(i.label)))
    assert.ok(resolved.items.some((i) => /Go Live/i.test(i.label)))
  })

  it('injects post-Go Live chips when published without hostname', () => {
    const input = 'Published successfully — your store is live. claim_live true.'
    const resolved = resolveFollowUps(input)
    assert.ok(resolved)
    assert.ok(resolved.items.some((i) => /payments|domain|checklist/i.test(i.label)))
  })

  it('extracts brand from sites.indobase.in URL', async () => {
    const { extractBrandFromMessage } = await import('./followups.ts')
    assert.equal(extractBrandFromMessage('Live at https://aural.sites.indobase.in'), 'Aural')
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

  it('injects generic building chips when agent omitted FOLLOWUPS', () => {
    const input =
      'I updated the hero layout with clearer typography, tighter spacing, and a stronger mobile grid for the storefront shell.'
    const resolved = resolveFollowUps(input)
    assert.ok(resolved)
    assert.ok(resolved!.items.length >= 2)
    assert.ok(resolved!.items.some((i) => /Go Live|Keep building|Refine/i.test(i.label)))
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

  it('injects ensure-first chips for SaaS deliverables without backend', () => {
    assert.ok(looksLikeSaaSOrBackendAppAsk('Build a SaaS web app with user login and database'))
    const input =
      "Here's your client portal UI with sign-in screens — preview ready.\n\nWhat's in it: dashboard shell."
    const resolved = resolveFollowUps(input)
    assert.ok(resolved)
    assert.ok(resolved.items.some((i) => /Enable login \+ database/i.test(i.label)))
    assert.ok(resolved.items.some((i) => /guidedBackend mode=generic/i.test(i.message)))
  })

  it('looksLikeAutoChainIntent detects launch store and backend asks', () => {
    assert.ok(looksLikeAutoChainIntent('Launch my apparel store with real backend'))
    assert.ok(looksLikeAutoChainIntent('Add a real backend and take it live for my shop'))
    assert.ok(looksLikeAutoChainIntent('Create admin dashboard for orders'))
    assert.equal(looksLikeAutoChainIntent('Niche Apparel — preview only, do NOT call guidedBackend yet'), false)
  })

  it('injects auto-chain niche chips when agent asks niche with launch intent in prose', () => {
    const input =
      "You're verified — I'll launch your store with real backend. What will your store sell? Apparel, electronics, or food?"
    assert.ok(looksLikeAutoChainIntent(input))
    const resolved = resolveFollowUps(input)
    assert.ok(resolved)
    assert.match(resolved.title, /Launch|full backend/i)
    assert.ok(resolved.items.every((i) => /INDOBASE_GUIDED_BACKEND|guidedBackend/i.test(i.message)))
    assert.ok(resolved.items.every((i) => !/Do NOT call guidedBackend yet/i.test(i.message)))
  })

  it('autoChainStoreFollowups invoke guidedBackend with place_test_order', () => {
    const stage = autoChainStoreFollowups('MERIDIAN')
    assert.ok(stage.items.length >= 2)
    for (const item of stage.items) {
      assert.match(item.message, /guidedBackend|INDOBASE_GUIDED_BACKEND/i)
      assert.match(item.message, /place_test_order=true|placeTestShopOrder/i)
    }
  })

  it('injects auto-chain backend chips for launch intent deliverable without backend', () => {
    const input =
      "Here's what I built — storefront preview ready. You asked to launch your electronics store with real backend and inventory."
    assert.ok(looksLikeAutoChainIntent(input))
    const resolved = resolveFollowUps(input)
    assert.ok(resolved)
    assert.ok(resolved.items.some((i) => /Launch with real backend|guidedBackend/i.test(i.label + i.message)))
  })
})
