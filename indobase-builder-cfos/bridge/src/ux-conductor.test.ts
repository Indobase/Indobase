import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { AGENT_FACING_TOOL_NAMES } from './production-launch/agent-surface.js'
import {
  HOME_INTENTS,
  UX_CONDUCTOR_AGENT_RULES,
  UX_HOME_HEADLINE,
  businessJobStageTitle,
  businessJourneyStageLabel,
  businessReadiness,
  uxContextualActions,
  uxHeadline,
  uxJobHeadline,
} from './ux-conductor.ts'

describe('UX conductor', () => {
  it('does not expand the frozen agent tool surface', () => {
    assert.deepEqual([...AGENT_FACING_TOOL_NAMES], [
      'launchProductionApp',
      'launchBusiness',
      'connectGateway',
      'productionChecklist',
      'promptQuota',
    ])
    assert.doesNotMatch(UX_CONDUCTOR_AGENT_RULES, /new agent tool|add a tool/i)
  })

  it('home intents are business language, not architecture', () => {
    assert.equal(UX_HOME_HEADLINE, 'What do you want to launch?')
    assert.equal(HOME_INTENTS.length, 6)
    for (const tile of HOME_INTENTS) {
      assert.doesNotMatch(tile.prompt, /guidedBackend|ensureDatabase|applySchema|PocketBase|Commerce ABI|POST \/api/i)
      assert.doesNotMatch(tile.label, /backend|schema|gadget/i)
    }
    assert.ok(HOME_INTENTS.some((t) => t.id === 'launch-store' && t.description === 'Sell online'))
  })

  it('maps job stages to business titles', () => {
    assert.equal(businessJobStageTitle('provision'), 'Store foundation')
    assert.equal(businessJobStageTitle('wire'), 'Connecting checkout')
    assert.equal(businessJobStageTitle('verify'), 'Quality checks')
    assert.doesNotMatch(businessJobStageTitle('provision'), /ensureDatabase|auth \+ database/i)
    assert.equal(businessJobStageTitle('generate', 'landing'), 'Building website')
  })

  it('maps journey stages away from Backend / Go Live jargon', () => {
    assert.equal(businessJourneyStageLabel('backend'), 'Store')
    assert.equal(businessJourneyStageLabel('live'), 'Launch')
    assert.equal(businessJourneyStageLabel('production'), 'Ready')
  })

  it('offers at most three contextual actions and no tool names', () => {
    const live = uxContextualActions({
      guest: false,
      live: true,
      backendReady: true,
      paymentsReady: false,
      liveUrl: 'https://urbanthread.sites.indobase.in',
    })
    assert.ok(live.length >= 1 && live.length <= 3)
    assert.ok(live.some((a) => /Connect payments/i.test(a.label)))
    for (const a of live) {
      assert.doesNotMatch(a.label, /guidedBackend|ensureDatabase|launchProductionApp|checklist/i)
      assert.doesNotMatch(a.message, /POST \/api|guidedBackend|ensureDatabase|applySchema/i)
    }
  })

  it('payments warning is understandable, not a CAS/ABI failure', () => {
    const items = businessReadiness({
      guest: false,
      live: true,
      backendReady: true,
      paymentsReady: false,
    })
    const payments = items.find((i) => i.id === 'payments')
    assert.equal(payments?.status, 'warning')
    assert.equal(uxHeadline({
      guest: false,
      live: true,
      backendReady: true,
      paymentsReady: false,
    }), 'Your store is live — payments are optional until you connect them')
  })

  it('job card never says Launching ecommerce', () => {
    assert.equal(uxJobHeadline({ status: 'running', appType: 'ecommerce' }), 'Building your store')
    assert.equal(uxJobHeadline({ status: 'live', appType: 'ecommerce', url: 'https://x.sites.indobase.in' }), 'Your store is live')
  })
})
