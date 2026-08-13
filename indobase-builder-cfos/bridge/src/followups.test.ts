import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  parseFollowUps,
  resolveFollowUps,
  looksLikeCompletedDeliverable,
  looksLikePreBuildClarification,
  looksLikeSaaSOrBackendAppAsk,
  looksLikeAutoChainIntent,
  looksLikeClearLandingAsk,
  looksLikeLandingSingleTurnIntent,
  autoChainStoreFollowups,
  landingSingleTurnFollowups,
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
  stripToolCapsuleNoise,
  cleanOperatorMessage,
  stampAuthoritativeTurn,
  stripAuthoritativeTurnStamp,
  operatorChipLabel,
  parseFollowUpLine,
  injectJourneyNextActionFollowUps,
  filterChipsForLiveJourney,
  filterChipsForJourneyState,
  operatorMayClaimLive,
  shouldShowLaunchJourneyCard,
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
    // Live hostname → post-Go Live ladder (domain / payments / checklist)
    assert.ok(
      resolved.items.some((i) => /Connect my domain|Add payments|Production checklist/i.test(i.label)),
    )
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
    assert.equal(resolved.items.length, MAX_VISIBLE_CHIPS)
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

  it('building stage keeps ≤3 personalized launch-ladder chips', () => {
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
    assert.equal(resolved.items.length, MAX_VISIBLE_CHIPS)
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
    assert.equal(stage.items.length, MAX_VISIBLE_CHIPS)
    assert.ok(stage.items.some((i) => /Add a real backend|Go Live|Launch store/i.test(i.label)))
    assert.ok(stage.items.every((i) => !/leave it as-is/i.test(i.label)))
    const block = formatFollowUpsBlock(stage.title, stage.items)
    assert.match(block, /<<<INDOBASE_FOLLOWUPS/)
    assert.match(block, /guidedBackend|launchBusiness|Launch/i)
    const parsed = parseFollowUps(`Preview ready.\n\n${block}`)
    assert.ok(parsed)
    assert.equal(parsed.items.length, MAX_VISIBLE_CHIPS)
  })

  it('deliverable stage caps long agent walls at MAX_VISIBLE_CHIPS', () => {
    const block = formatFollowUpsBlock('Where should I take Aural next?', DEFAULT_POST_BUILD_FOLLOWUPS)
    const input = `Here's what I built — live preview\nhttps://aural.sites.indobase.in\n\n${block}`
    assert.equal(DEFAULT_POST_BUILD_FOLLOWUPS.length > MAX_VISIBLE_CHIPS, true)
    const resolved = resolveFollowUps(input)
    assert.ok(resolved)
    assert.equal(resolved.items.length, MAX_VISIBLE_CHIPS)
    assert.ok(resolved.items.some((i) => /Go Live|Launch store/i.test(i.label)))
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

  it('ecommerceVerticalFollowups autoChain uses catalog vertical ids', async () => {
    const { ecommerceVerticalFollowups, ECOMMERCE_VERTICALS } = await import('./vertical-catalog.ts')
    const { items } = ecommerceVerticalFollowups('MERIDIAN', { autoChain: true })
    assert.ok(items.length >= 2)
    const catalogIds = new Set(ECOMMERCE_VERTICALS.map((v) => v.id))
    for (const item of items.slice(0, 4)) {
      assert.match(item.message, /INDOBASE_GUIDED_BACKEND mode=ecommerce vertical=/i)
      assert.doesNotMatch(item.message, /Do NOT call guidedBackend yet/i)
      const m = /vertical=([\w-]+)/i.exec(item.message)
      assert.ok(m?.[1] && catalogIds.has(m[1]))
    }
  })

  it('autoChainStoreFollowups labels match catalog verticals', () => {
    const stage = autoChainStoreFollowups('MERIDIAN')
    assert.equal(stage.items[0].label, 'Apparel / fashion')
    assert.equal(stage.items[1].label, 'Electronics')
    assert.equal(stage.items[2].label, 'Food & grocery')
    assert.equal(stage.items[3].label, 'Beauty')
    for (const item of stage.items) {
      assert.match(item.message, /vertical=(apparel|electronics|food-grocery|beauty)/)
    }
  })

  it('postGoLiveFollowups put Add payments first for stores', () => {
    const store = postGoLiveFollowups('Aural', { store: true })
    assert.equal(store.items[0]?.label, 'Add payments')
    assert.ok(store.items.some((i) => /Connect my domain/i.test(i.label)))
  })

  it('postGoLiveFollowups omit ensureAnalytics chip (stripped on CFOS)', () => {
    const store = postGoLiveFollowups('Aural', { store: true })
    assert.ok(!store.items.some((i) => /Add analytics|ensureAnalytics/i.test(i.label + i.message)))
    const landing = postGoLiveFollowups('CRUMB', { store: false })
    assert.ok(!landing.items.some((i) => /ensureAnalytics|Add analytics/i.test(i.label + i.message)))
    assert.ok(landing.items.some((i) => /Connect my domain|CNAME/i.test(i.label + i.message)))
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
    assert.equal(looksLikeAutoChainIntent('Website for my bakery — landing page'), false)
  })

  it('looksLikeClearLandingAsk and landing single-turn chips skip guidedBackend', () => {
    assert.ok(looksLikeClearLandingAsk('Website for my bakery'))
    assert.ok(looksLikeLandingSingleTurnIntent('Build a landing page for my cafe'))
    assert.equal(looksLikeClearLandingAsk('Launch my apparel store'), false)
    const stage = landingSingleTurnFollowups('CRUMB')
    assert.ok(stage.items.some((i) => /\/api\/os\/apps\/launch|appType:\s*"landing"|launchBusiness app_type=landing/i.test(i.message)))
    assert.ok(stage.items.every((i) => !/guidedBackend mode=ecommerce/i.test(i.message)))
    assert.ok(stage.items.every((i) => !/ensureAnalytics|Add analytics/i.test(i.label + i.message)))
  })

  it('injects landing single-turn Go Live chips for clear landing deliverables', () => {
    const input =
      "Here's what I built — CRUMB bakery landing preview ready.\n\nWhat's in it: hero, menu teaser, contact. Website for my bakery."
    assert.ok(looksLikeLandingSingleTurnIntent(input))
    const resolved = resolveFollowUps(input)
    assert.ok(resolved)
    assert.ok(resolved.items.some((i) => /Go Live/i.test(i.label)))
    assert.ok(resolved.items.some((i) => /\/api\/os\/apps\/launch|appType:\s*"landing"|launchBusiness app_type=landing|skip guidedBackend/i.test(i.message)))
    assert.ok(resolved.items.every((i) => !/INDOBASE_GUIDED_BACKEND mode=ecommerce/i.test(i.message)))
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

  it('injects journey next_action when agent omits FOLLOWUPS on substantive reply', () => {
    const input =
      'I refined the hero typography and tightened spacing on mobile. The bakery landing page reads cleaner now.'
    const resolved = resolveFollowUps(input, {
      journeyNextAction: {
        label: 'Go Live on Indobase',
        message:
          'Go Live — publish this business with launchBusiness using the real html/files, quote the exact live url.',
      },
      journeyHeadline: 'Backend ready — publish to your Indobase subdomain',
    })
    assert.ok(resolved)
    assert.equal(resolved.items[0].label, 'Go Live on Indobase')
    assert.match(resolved.title, /publish to your Indobase subdomain/i)
  })

  it('prepends journey next_action to deliverable chips without duplicating Go Live', () => {
    const input =
      "Here's what I built — MERIDIAN live preview\nhttps://demo.sites.indobase.in\nWhere do you want to take it next?"
    const resolved = resolveFollowUps(input, {
      journeyNextAction: {
        label: 'Go Live on Indobase',
        message: 'Go Live — publish MERIDIAN with launchBusiness and quote the exact url.',
      },
    })
    assert.ok(resolved)
    assert.ok(resolved.items.some((i) => /Go Live/i.test(i.label)))
    assert.ok(resolved.items.length <= MAX_VISIBLE_CHIPS)
  })

  it('operator chip labels never name launchBusiness', () => {
    assert.equal(operatorChipLabel('Go Live with launchBusiness'), 'Go Live')
    assert.equal(operatorChipLabel('Launch store'), 'Launch store')
    const parsed = parseFollowUpLine('Go Live with launchBusiness | Go Live — call launchProductionApp')
    assert.ok(parsed)
    assert.doesNotMatch(parsed.label, /launchBusiness/)
    assert.match(parsed.message, /launchProductionApp/)
  })

  it('stamps authoritative runtime onto the outbound turn and strips it from operator display', () => {
    const stamped = stampAuthoritativeTurn(
      'Show me order #zvka8renspuyufi',
      'orders (from BusinessRuntimeState):\n- #zvka8renspuyufi pending Priya Shopper',
    )
    assert.match(stamped, /<<<INDOBASE_RUNTIME>>>/)
    assert.match(stamped, /#zvka8renspuyufi/)
    assert.match(stamped, /Show me order #zvka8renspuyufi/)
    const visible = cleanOperatorMessage(stamped)
    assert.doesNotMatch(visible, /INDOBASE_RUNTIME/)
    assert.match(visible, /Show me order #zvka8renspuyufi/)
    assert.equal(stripAuthoritativeTurnStamp(stamped), 'Show me order #zvka8renspuyufi')
  })

  it('operator-visible text never leaks INDOBASE_RUNTIME, Studio, PocketBase, or provisioner', () => {
    const leaked = stampAuthoritativeTurn(
      'Launch a premium sneaker store called UrbanThread',
      [
        'INDOBASE_RUNTIME (authoritative this turn):',
        'Never say Studio, PocketBase, tenant, provisioner.',
        'launchProductionApp POST /api/os/apps/launch',
        'PocketBase is hidden. Studio is not a destination.',
      ].join('\n'),
    )
    const visible = cleanOperatorMessage(leaked)
    assert.doesNotMatch(visible, /INDOBASE_RUNTIME|PocketBase|Studio|provisioner/)
    assert.match(visible, /UrbanThread/)
  })

  it('stripToolCapsuleNoise removes sessionStatus dumps and blueprint list lines', () => {
    const input = `Updated the layout.

\`\`\`json
{"tool":"sessionStatus","signed_in":true,"stage":"member"}
\`\`\`

Listed 12 blueprints for format.design.

The hero is ready.`
    const cleaned = cleanOperatorMessage(input)
    assert.doesNotMatch(cleaned, /sessionStatus/)
    assert.doesNotMatch(cleaned, /Listed 12 blueprints/)
    assert.match(cleaned, /hero is ready/)
  })

  it('injectJourneyNextActionFollowUps returns null when agent authored FOLLOWUPS', () => {
    const input = `Done.

<<<INDOBASE_FOLLOWUPS
title: Next
Refine | Refine design
INDOBASE_FOLLOWUPS>>>`
    assert.equal(
      injectJourneyNextActionFollowUps(input, { label: 'Go Live', message: 'Go Live now' }),
      null,
    )
  })

  it('when journey is live, niche CHOICES are replaced with post-live chips (no Apparel)', () => {
    const input = `What will your online shop sell?

<<<INDOBASE_CHOICES
title: What will your online shop sell?
Apparel | Niche apparel
Electronics | Niche electronics
Food & grocery | Niche food
Beauty | Niche beauty
INDOBASE_CHOICES>>>`
    const resolved = resolveFollowUps(input, {
      journeyIsLive: true,
      journeyLiveUrl: 'https://shop.sites.indobase.in',
      journeyHeadline: 'Your site is live — add payments to start selling',
      journeyNextAction: {
        label: 'Add payments',
        message: 'Add payments — India vs Stripe',
      },
    })
    assert.ok(resolved)
    assert.ok(!resolved.items.some((i) => /Apparel|Electronics|Beauty|Food/i.test(i.label)))
    assert.ok(resolved.items.some((i) => /payments/i.test(i.label)))
    assert.ok(!resolved.items.some((i) => /go live/i.test(i.label)))
  })

  it('filterChipsForLiveJourney strips Go Live chips', () => {
    const filtered = filterChipsForLiveJourney(
      {
        body: 'ok',
        title: 'Next',
        items: [
          { label: 'Go Live on Indobase', message: 'Go Live with launchBusiness' },
          { label: 'Keep building', message: 'Continue building' },
        ],
      },
      { isLive: true },
    )
    assert.equal(filtered.items.length, 1)
    assert.equal(filtered.items[0]?.label, 'Keep building')
  })

  it('pre-live payments CHOICES are stripped; non-payment chips can remain', () => {
    const paymentsOnly = `Where will customers pay?

<<<INDOBASE_CHOICES
title: Where will customers pay?
India (Razorpay) | settlement_market=india payments
International (Stripe) | settlement_market=intl payments
INDOBASE_CHOICES>>>`
    const stripped = resolveFollowUps(paymentsOnly, {
      journeyFlags: { isLive: false },
      journeyNextAction: {
        label: 'Go Live on Indobase',
        message: 'Go Live with launchBusiness',
      },
    })
    assert.ok(stripped)
    assert.ok(!stripped.items.some((i) => /razorpay|stripe|settlement_market/i.test(i.label + i.message)))
    assert.ok(stripped.items.some((i) => /go live/i.test(i.label)))

    const mixed = `Preview ready.

<<<INDOBASE_FOLLOWUPS
title: Where next?
Go Live on Indobase | Go Live with launchBusiness
Add payments | Connect payments settlement_market
Refine the design | Polish branding
INDOBASE_FOLLOWUPS>>>`
    const kept = resolveFollowUps(mixed, { journeyFlags: { isLive: false } })
    assert.ok(kept)
    assert.ok(!kept.items.some((i) => /add payments/i.test(i.label)))
    assert.ok(kept.items.some((i) => /go live/i.test(i.label)))
    assert.ok(kept.items.some((i) => /refine/i.test(i.label)))
  })

  it('Add payments stripped when paymentsReady + live', () => {
    const input = `Live at https://shop.sites.indobase.in

<<<INDOBASE_FOLLOWUPS
title: Where next?
Add payments | Connect payments
Connect my domain | connect domain
Production checklist | checklist
INDOBASE_FOLLOWUPS>>>`
    const resolved = resolveFollowUps(input, {
      journeyFlags: {
        isLive: true,
        isPaymentsReady: true,
        liveUrl: 'https://shop.sites.indobase.in',
      },
    })
    assert.ok(resolved)
    assert.ok(!resolved.items.some((i) => /add payments/i.test(i.label)))
    assert.ok(resolved.items.some((i) => /domain|checklist|analytics|wire/i.test(i.label)))
  })

  it('backend ensure chips stripped when backendReady', () => {
    const input = `Catalog seeded — claim_backend_ready.

<<<INDOBASE_FOLLOWUPS
title: Where next?
Add a real backend | Call guidedBackend then applySchema
Go Live on Indobase | Go Live with launchBusiness
INDOBASE_FOLLOWUPS>>>`
    const resolved = resolveFollowUps(input, {
      journeyFlags: { isLive: false, isBackendReady: true },
    })
    assert.ok(resolved)
    assert.ok(!resolved.items.some((i) => /add a real backend/i.test(i.label)))
    assert.ok(resolved.items.some((i) => /go live/i.test(i.label)))
  })

  it('filterChipsForJourneyState enforces live/backend/payments flags', () => {
    const base = {
      body: 'ok',
      title: 'Next',
      items: [
        { label: 'Go Live on Indobase', message: 'Go Live with launchBusiness' },
        { label: 'Add payments', message: 'connectGateway + wireCheckout' },
        { label: 'Add a real backend', message: 'Call guidedBackend then ensureDatabase applySchema' },
        { label: 'Connect my domain', message: 'customDomain CNAME' },
      ],
    }
    const preLive = filterChipsForJourneyState(base, { isLive: false })
    assert.ok(!preLive.items.some((i) => /add payments/i.test(i.label)))
    assert.ok(preLive.items.some((i) => /go live/i.test(i.label)))

    const live = filterChipsForJourneyState(base, { isLive: true })
    assert.ok(!live.items.some((i) => /go live/i.test(i.label)))
    assert.ok(live.items.some((i) => /add payments/i.test(i.label)))

    const backendReady = filterChipsForJourneyState(base, {
      isLive: false,
      isBackendReady: true,
    })
    assert.ok(!backendReady.items.some((i) => /add a real backend/i.test(i.label)))

    const paymentsReady = filterChipsForJourneyState(base, {
      isLive: true,
      isPaymentsReady: true,
    })
    assert.ok(!paymentsReady.items.some((i) => /add payments/i.test(i.label)))
  })

  it('postGoLiveFollowups skips Add payments when paymentsReady', () => {
    const ready = postGoLiveFollowups('Aural', { store: true, paymentsReady: true })
    assert.ok(!ready.items.some((i) => /add payments/i.test(i.label)))
    assert.ok(ready.items.some((i) => /checklist|domain|wire|admin/i.test(i.label)))
  })

  it('does not show live cards for guest/auth even when the store is already live', () => {
    const otp = `I sent a verification code to your email. Enter the code so I can continue.

<<<INDOBASE_FOLLOWUPS
title: Your store is live — payments are optional until you connect them
Connect payments | Connect payments
Add payments | Add payments
Connect my domain | Connect my domain
INDOBASE_FOLLOWUPS>>>`
    assert.equal(inferChipStage(otp), 'guest_gate')
    assert.equal(shouldShowLaunchJourneyCard({ isGuest: true, chipStage: 'guest_gate' }), false)
    assert.equal(
      operatorMayClaimLive({
        isGuest: true,
        isLive: true,
        liveUrl: 'https://urbanthread.sites.indobase.in',
        projectState: 'live',
      }),
      false,
    )
    const resolved = resolveFollowUps(otp, {
      journeyFlags: {
        isGuest: true,
        isLive: true,
        liveUrl: 'https://urbanthread.sites.indobase.in',
        projectState: 'live',
      },
      journeyHeadline: 'Your store is live — payments are optional until you connect them',
    })
    assert.ok(!resolved || resolved.items.length === 0)
  })

  it('does not inject live cards without verified live state', () => {
    const preview = `Here's what I built — UrbanThread preview is ready. Where should I take it next?`
    assert.equal(
      operatorMayClaimLive({
        isGuest: false,
        isLive: true,
        liveUrl: 'https://urbanthread.sites.indobase.in',
        projectState: 'preview_ready',
      }),
      false,
    )
    const resolved = resolveFollowUps(preview, {
      journeyFlags: {
        isGuest: false,
        isLive: true,
        liveUrl: 'https://urbanthread.sites.indobase.in',
        projectState: 'preview_ready',
      },
    })
    assert.ok(!resolved || !resolved.items.some((i) => /add payments|connect payments/i.test(i.label)))
    assert.equal(
      operatorMayClaimLive({
        isGuest: false,
        isLive: true,
        liveUrl: 'https://urbanthread.sites.indobase.in',
        projectState: 'live',
      }),
      true,
    )
  })

  it('dedupes Connect payments / Add payments chips', () => {
    const input = `Your store is live at https://urbanthread.sites.indobase.in

<<<INDOBASE_FOLLOWUPS
title: Where next?
Connect payments | Connect payments so customers can pay
Add payments | Connect payments settlement_market
Connect my domain | connect domain
INDOBASE_FOLLOWUPS>>>`
    const resolved = resolveFollowUps(input, {
      journeyFlags: {
        isLive: true,
        liveUrl: 'https://urbanthread.sites.indobase.in',
        projectState: 'live',
      },
      journeyNextAction: {
        label: 'Connect payments',
        message: 'Connect payments so customers can pay online.',
      },
    })
    assert.ok(resolved)
    const pay = resolved.items.filter((i) => /payments/i.test(i.label))
    assert.equal(pay.length, 1)
  })
})
