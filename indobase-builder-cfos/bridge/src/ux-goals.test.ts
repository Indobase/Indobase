/**
 * UX goal certification — first-time operator outcomes, not button UAT.
 * Same five tools. Click-to-edit and Control Center feed chat.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { AGENT_FACING_TOOL_NAMES } from './production-launch/agent-surface.js'
import {
  HOME_INTENTS,
  controlCenterNav,
  formatPreviewEditMessage,
  formatScreenMessage,
  projectCapabilities,
  resolveWorkspaceState,
  workspaceViewModel,
} from './ux-conductor.ts'

describe('UX goal certification', () => {
  it('keeps the frozen five-tool surface', () => {
    assert.deepEqual([...AGENT_FACING_TOOL_NAMES], [
      'launchProductionApp',
      'launchBusiness',
      'connectGateway',
      'productionChecklist',
      'promptQuota',
    ])
  })

  it('I want to launch a sneaker store — home intent is business language', () => {
    const store = HOME_INTENTS.find((t) => t.id === 'launch-store')
    assert.ok(store)
    assert.match(store.prompt, /online store/i)
    assert.doesNotMatch(store.prompt, /guidedBackend|launchProductionApp|PocketBase/i)
    assert.equal(resolveWorkspaceState({}), 'empty')
  })

  it('I want to change the homepage — click-to-edit carries target + request', () => {
    const message = formatPreviewEditMessage({
      target: { type: 'section', id: 'hero', component: 'Hero', label: 'Hero', text: 'Premium sneakers for everyone' },
      intent: 'modify_copy',
      request: 'Make the headline shorter and more premium.',
    })
    assert.match(message, /^PREVIEW_EDIT/)
    assert.match(message, /target: section \/ hero \(Hero\)/)
    assert.match(message, /source: preview/)
    assert.match(message, /intent: modify_copy/)
    assert.match(message, /request: Make the headline shorter and more premium/)
    assert.doesNotMatch(message, /new tool|guidedBackend/i)
  })

  it('I want to add a product — Products screen is implied', () => {
    const message = formatScreenMessage({ section: 'products', label: 'Products' }, 'Add 10 summer products.')
    assert.match(message, /^SCREEN/)
    assert.match(message, /section: products/)
    assert.match(message, /request: Add 10 summer products/)
  })

  it('I want to find and change an order — entity stays on screen', () => {
    const find = formatScreenMessage({ section: 'orders', label: 'Orders' }, "Show me today's orders.")
    const change = formatScreenMessage(
      { section: 'orders', entityId: '1042', label: 'Orders' },
      'Mark #1042 as shipped.',
    )
    assert.match(find, /section: orders/)
    assert.match(change, /entity: 1042/)
    assert.match(change, /Mark #1042 as shipped/)
  })

  it('I want to connect payments — live store still has a payments nav + warning', () => {
    const view = workspaceViewModel({
      live: true,
      liveUrl: 'https://urbanthread.sites.indobase.in',
      backendReady: true,
      paymentsReady: false,
      appType: 'ecommerce',
    })
    assert.equal(view.state, 'live')
    assert.ok(view.nav.some((n) => n.id === 'payments'))
    assert.ok(view.actions.some((a) => /Connect payments/i.test(a.label)))
    assert.ok(view.showControlCenter)
  })

  it('I want to open my live store — Open store is a visual action, not a new tool', () => {
    const view = workspaceViewModel({
      live: true,
      liveUrl: 'https://urbanthread.sites.indobase.in',
      backendReady: true,
      paymentsReady: true,
      appType: 'ecommerce',
    })
    assert.ok(view.actions.some((a) => /Open store/i.test(a.label)))
    assert.match(view.liveUrl || '', /urbanthread\.sites\.indobase\.in/)
  })

  it('Control Center nav follows the contract, not a single Shopify shell', () => {
    const store = controlCenterNav('store', projectCapabilities({ appType: 'ecommerce' }))
    assert.deepEqual(
      store.map((n) => n.id),
      ['overview', 'products', 'orders', 'customers', 'storefront', 'payments', 'settings'],
    )
    const saas = controlCenterNav('app', projectCapabilities({ appType: 'saas' }))
    assert.ok(saas.some((n) => n.id === 'users'))
    assert.ok(saas.some((n) => n.id === 'data'))
    assert.ok(!saas.some((n) => n.id === 'products'))
    const site = controlCenterNav('website', projectCapabilities({ appType: 'landing' }))
    assert.ok(site.some((n) => n.id === 'website'))
    assert.ok(site.some((n) => n.id === 'content'))
    const booking = controlCenterNav('booking', projectCapabilities({ kind: 'booking' }))
    assert.ok(booking.some((n) => n.id === 'bookings'))
    assert.ok(booking.some((n) => n.id === 'calendar'))
  })

  it('project state is derived from the job/journey — UI does not invent a parallel model', () => {
    assert.equal(resolveWorkspaceState({ jobStatus: 'running', jobStage: 'generate' }), 'building')
    assert.equal(resolveWorkspaceState({ backendReady: true }), 'building')
    assert.equal(
      resolveWorkspaceState({ backendReady: true, previewReady: true, previewUrl: '/live/x/' }),
      'production_ready',
    )
    assert.equal(
      resolveWorkspaceState({ live: true, liveUrl: 'https://x.sites.indobase.in' }),
      'live',
    )
    const live = workspaceViewModel({
      live: true,
      liveUrl: 'https://x.sites.indobase.in',
      backendReady: true,
      appType: 'ecommerce',
      contractCapabilityIds: ['product_catalogue', 'admin_orders', 'auth'],
    })
    assert.ok(live.capabilities.includes('commerce'))
    assert.ok(live.capabilities.includes('storefront'))
  })
})
