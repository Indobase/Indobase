import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { emptyBusinessRuntimeState } from '@indobase/platform'

import {
  assertCapabilityFitsKind,
  composePresentation,
  contextualActionsFor,
  executionCardFromState,
  launchFailureShouldSurface,
  lifecycleFromRuntime,
  presentsInternalLeak,
  streamPhaseFromHint,
  hostedSiteUrlFromOperatorMessage,
  translateOperatorCopy,
  type RuntimeView,
} from './presentation.ts'
import { controlCenterNav, projectCapabilities } from '../ux-conductor.ts'

function ecommerceReady(): RuntimeView {
  return emptyBusinessRuntimeState({
    business: { ref: 'p1', name: 'Summit Outfitters', kind: 'ecommerce', state: 'preview_ready' },
    spec: { businessName: 'Summit Outfitters', businessType: 'ecommerce', currency: 'INR' },
    preview: { status: 'ready', url: '/live/p1/' },
    catalog: { productCount: 8, inStockCount: 8, lowStockCount: 0 },
    health: { catalogReady: true, paymentsReady: false, previewReady: true },
  })
}

function saasPreview(): RuntimeView {
  return emptyBusinessRuntimeState({
    business: { ref: 'p2', name: 'LessonLoop', kind: 'saas', state: 'preview_ready' },
    spec: { businessName: 'LessonLoop', businessType: 'saas' },
    preview: { status: 'ready', url: '/live/p2/' },
    health: { catalogReady: true, paymentsReady: false, previewReady: true },
  })
}

function landingLive(): RuntimeView {
  return emptyBusinessRuntimeState({
    business: { ref: 'p3', name: 'Coastal Atelier', kind: 'landing', state: 'live' },
    spec: { businessName: 'Coastal Atelier', businessType: 'landing' },
    preview: { status: 'ready', url: '/live/p3/' },
    live: { isLive: true, url: 'https://coastal.sites.indobase.in' },
    health: { catalogReady: false, paymentsReady: false, previewReady: true },
  })
}

describe('presentation layer', () => {
  it('maps ecommerce BUILD → PREVIEW → READY → LIVE → OPERATING', () => {
    const building = emptyBusinessRuntimeState({
      spec: { businessName: 'Summit Outfitters', businessType: 'ecommerce' },
      preview: { status: 'building', url: null },
    })
    assert.equal(lifecycleFromRuntime(building), 'BUILD')
    assert.equal(lifecycleFromRuntime(ecommerceReady()), 'READY')
    const live = emptyBusinessRuntimeState({
      business: { ref: 'p1', name: 'Summit Outfitters', kind: 'ecommerce', state: 'live' },
      spec: { businessName: 'Summit Outfitters', businessType: 'ecommerce' },
      preview: { status: 'ready', url: '/live/p1/' },
      live: { isLive: true, url: 'https://summit.sites.indobase.in' },
      health: { catalogReady: true, paymentsReady: false, previewReady: true },
    })
    assert.equal(lifecycleFromRuntime(live), 'LIVE')
    const operating = emptyBusinessRuntimeState({
      ...live,
      commerce: { orderCount: 2, pendingOrderCount: 0 },
      orders: [{ id: '1', orderNumber: '1001', amountMinor: 120000 }],
    })
    assert.equal(lifecycleFromRuntime(operating), 'OPERATING')
  })

  it('BUILD/LAUNCH presentation for ecommerce, saas, and landing', () => {
    const ecomBuild = executionCardFromState(ecommerceReady(), { turnClass: 'build' })
    assert.equal(ecomBuild?.kind, 'updated')
    const ecomLaunch = executionCardFromState(
      { ...ecommerceReady(), live: { isLive: true, url: 'https://x.sites.indobase.in' } },
      { turnClass: 'launch', jobStatus: 'live' },
    )
    assert.equal(ecomLaunch?.kind, 'live')
    assert.doesNotMatch(`${ecomLaunch?.title} ${ecomLaunch?.body}`, /launchBusiness|jobId|PocketBase/i)

    const saas = composePresentation(saasPreview(), { turnClass: 'build' })
    assert.equal(saas.home.typeLabel, 'SaaS')
    assert.ok(!saas.control.nav.some((n) => n.id === 'products' || n.id === 'orders'))
    assert.ok(saas.actions.some((a) => /Publish|Preview/i.test(a.label)))

    const land = composePresentation(landingLive(), { turnClass: 'launch', jobStatus: 'live' })
    assert.equal(land.lifecycle.current, 'LIVE')
    assert.ok(!land.control.nav.some((n) => n.id === 'products' || n.id === 'payments'))
    assert.match(land.copy.liveBanner || '', /live/i)
    assert.ok(land.actions.some((a) => /Open website/i.test(a.label)))
  })

  it('operate/modify cards come from real step status', () => {
    const updated = executionCardFromState(ecommerceReady(), {
      turnClass: 'modify',
      stepStatuses: [{ id: 'runtime.preview', status: 'succeeded' }],
    })
    assert.equal(updated?.kind, 'updated')
    assert.equal(updated?.fromStep, true)
    const operate = composePresentation(
      emptyBusinessRuntimeState({
        business: { ref: 'p1', name: 'Summit Outfitters', kind: 'ecommerce', state: 'live' },
        spec: { businessName: 'Summit Outfitters', businessType: 'ecommerce' },
        live: { isLive: true, url: 'https://summit.sites.indobase.in' },
        preview: { status: 'ready', url: '/live/p1/' },
        commerce: { orderCount: 1, pendingOrderCount: 0 },
        health: { catalogReady: true, paymentsReady: false, previewReady: true },
      }),
      { turnClass: 'operate' },
    )
    assert.equal(operate.lifecycle.current, 'OPERATING')
    assert.ok(operate.actions.some((a) => /Manage products|View orders|Connect payments/i.test(a.label)))
  })

  it('never leaks internals in copy or chips', () => {
    const leaked = translateOperatorCopy(
      'Call launchBusiness then executeProductionLaunchJob jobId plj_abc PocketBase guidedBackend persistCatalogProjection is not defined',
    )
    assert.equal(presentsInternalLeak(leaked), false)
    assert.doesNotMatch(leaked, /launchBusiness|PocketBase|jobId|plj_|guidedBackend|executeProductionLaunchJob|persistCatalogProjection|is not defined/)
    const surface = composePresentation(ecommerceReady())
    const blob = JSON.stringify(surface)
    assert.doesNotMatch(
      blob,
      /launchBusiness|launchProductionApp|placeTestShopOrder|guidedBackend|ensureDatabase|PocketBase|executeProductionLaunchJob|Commerce ABI|projectRef/,
    )
  })

  it('wrong capabilities are rejected per business type', () => {
    const saasNav = controlCenterNav('saas', projectCapabilities({ appType: 'saas' }))
    assert.deepEqual(assertCapabilityFitsKind('saas', saasNav), [])
    assert.ok(!saasNav.some((n) => n.id === 'products'))
    const landingNav = controlCenterNav('landing', projectCapabilities({ appType: 'landing' }))
    assert.deepEqual(assertCapabilityFitsKind('landing', landingNav), [])
    assert.ok(!landingNav.some((n) => n.id === 'products' || n.id === 'orders' || n.id === 'payments'))
    const storeNav = controlCenterNav('ecommerce', projectCapabilities({ appType: 'ecommerce' }))
    assert.ok(storeNav.some((n) => n.id === 'products'))
  })

  it('failed vs successful launch UX', () => {
    const blocked = composePresentation(ecommerceReady(), {
      turnClass: 'launch',
      jobStatus: 'blocked',
      planStatus: 'failed',
      failureCode: 'backend_required',
      repairable: true,
    })
    assert.equal(blocked.stream.phase, 'BLOCKED')
    assert.equal(blocked.executionCard?.kind, 'blocked')
    assert.doesNotMatch(blocked.copy.body, /backend_required|call a tool|launchBusiness/i)
    assert.ok(blocked.actions.some((a) => /Fix it automatically|Try again/i.test(a.label)))
    const live = composePresentation(
      emptyBusinessRuntimeState({
        business: { ref: 'p1', name: 'Summit Outfitters', kind: 'ecommerce', state: 'live' },
        spec: { businessName: 'Summit Outfitters', businessType: 'ecommerce' },
        live: { isLive: true, url: 'https://summit.sites.indobase.in' },
        preview: { status: 'ready', url: '/live/p1/' },
        health: { catalogReady: true, paymentsReady: false, previewReady: true },
      }),
      { turnClass: 'launch', jobStatus: 'live' },
    )
    assert.equal(live.executionCard?.kind, 'live')
    assert.match(live.copy.liveBanner || '', /live/i)
    assert.ok(!live.home.metrics.some((m) => /₹0|Today/.test(m.value) && m.id === 'sales'))
  })

  it('does not treat a stale blocked job as a preview blocker', () => {
    const ready = ecommerceReady()
    assert.equal(launchFailureShouldSurface(ready, { jobStatus: 'blocked' }), false)
    const preview = composePresentation(ready, { jobStatus: 'blocked', turnClass: 'build' })
    assert.equal(preview.stream.phase, 'COMPLETED')
    assert.equal(preview.executionCard?.kind, 'updated')
    assert.match(preview.executionCard?.title || '', /ready/i)
  })

  it('empty, loading, and stream phases', () => {
    const empty = composePresentation(emptyBusinessRuntimeState())
    assert.equal(empty.home.empty, true)
    const loading = composePresentation(ecommerceReady(), { planStatus: 'running', jobStatus: 'running' })
    assert.equal(loading.home.loading, true)
    assert.equal(
      streamPhaseFromHint(emptyBusinessRuntimeState({ spec: { businessName: 'X', businessType: 'ecommerce' } }), {
        planStatus: 'pending',
        stepStatuses: [{ id: 'runtime.create', status: 'pending' }],
      }).phase,
      'THINKING',
    )
    assert.equal(
      streamPhaseFromHint(ecommerceReady(), {
        planStatus: 'running',
        stepStatuses: [{ id: 'verify', status: 'running' }],
      }).phase,
      'VERIFYING',
    )
    assert.equal(
      streamPhaseFromHint(ecommerceReady(), { planStatus: 'running', turnClass: 'launch', jobStage: 'deploy' }).phase,
      'EXECUTING',
    )
    const thinking = streamPhaseFromHint(emptyBusinessRuntimeState({ spec: { businessName: 'X', businessType: 'ecommerce' } }))
    assert.ok(thinking.phase === 'THINKING' || thinking.phase === 'IDLE' || thinking.phase === 'COMPLETED')
  })

  it('preview chips are Preview/Publish; post-live are operate actions', () => {
    const preview = contextualActionsFor(saasPreview())
    assert.ok(preview.some((a) => a.label === 'Open preview'))
    assert.ok(preview.some((a) => /\/live\/p2\//.test(a.message)))
    assert.ok(preview.some((a) => a.label === 'Publish'))
    const liveStore = contextualActionsFor(
      emptyBusinessRuntimeState({
        business: { ref: 'p1', name: 'Summit Outfitters', kind: 'ecommerce', state: 'live' },
        spec: { businessName: 'Summit Outfitters', businessType: 'ecommerce' },
        live: { isLive: true, url: 'https://summit.sites.indobase.in' },
        preview: { status: 'ready', url: '/live/p1/' },
        health: { catalogReady: true, paymentsReady: false, previewReady: true },
      }),
    )
    assert.ok(liveStore.some((a) => /Open store/i.test(a.label)))
    assert.ok(liveStore.some((a) => /Connect payments/i.test(a.label)))
  })

  it('opens only Indobase hosted preview/live URLs from chip messages', () => {
    assert.equal(
      hostedSiteUrlFromOperatorMessage('Open my preview /live/p2/', 'https://builder.indobase.in'),
      'https://builder.indobase.in/live/p2/',
    )
    assert.equal(
      hostedSiteUrlFromOperatorMessage('Open my live store https://summit.sites.indobase.in', ''),
      'https://summit.sites.indobase.in',
    )
    assert.equal(
      hostedSiteUrlFromOperatorMessage('Launch my store on Indobase now.', 'https://builder.indobase.in'),
      null,
    )
    assert.equal(hostedSiteUrlFromOperatorMessage('Open https://evil.example/', ''), null)
  })

  it('points store owners at pending orders the same way websites point at enquiries', () => {
    const surface = composePresentation(
      emptyBusinessRuntimeState({
        business: { ref: 'p4', name: 'Summit Outfitters', kind: 'ecommerce', state: 'live' },
        spec: { businessName: 'Summit Outfitters', businessType: 'ecommerce', currency: 'INR' },
        preview: { status: 'ready', url: '/live/p4/' },
        live: { isLive: true, url: 'https://summit.sites.indobase.in' },
        commerce: { orderCount: 3, pendingOrderCount: 2, todayOrderCount: 1 },
        health: { catalogReady: true, paymentsReady: true, previewReady: true },
      }),
    )
    assert.equal(surface.home.inboxSection, 'orders')
    assert.match(surface.home.inboxStatus || '', /2 orders need attention/i)
  })
})
