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
  humanizeLaunchFailure,
  resolveWorkspaceState,
  stripInternalFailureCopy,
  uxContextualActions,
  uxHeadline,
  uxJobHeadline,
  workspaceViewModel,
  formatPreviewEditMessage,
  previewSelectToEditMessage,
  previewEditSuggestions,
  projectCapabilities,
  controlCenterNav,
  viewProjectsAuthority,
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
      assert.doesNotMatch(tile.prompt, /guidedBackend|ensureDatabase|applySchema|PocketBase|Commerce ABI|Studio|tenant|provisioner|POST \/api/i)
      assert.doesNotMatch(tile.label, /backend|schema|gadget|Studio/i)
    }
    assert.ok(HOME_INTENTS.some((t) => t.id === 'launch-store' && t.description === 'Sell online'))
  })

  it('maps job stages to business-specific titles', () => {
    assert.equal(businessJobStageTitle('classify'), 'Understanding your brand')
    assert.equal(businessJobStageTitle('provision'), 'Setting up products & inventory')
    assert.equal(businessJobStageTitle('wire'), 'Connecting checkout')
    assert.equal(businessJobStageTitle('verify'), 'Testing your store')
    assert.equal(businessJobStageTitle('deploy'), 'Preparing launch')
    assert.doesNotMatch(businessJobStageTitle('provision'), /ensureDatabase|auth \+ database|Store foundation/i)
    assert.equal(businessJobStageTitle('classify', 'saas'), 'Understanding your product')
    assert.equal(businessJobStageTitle('provision', 'saas'), 'Setting up accounts')
    assert.equal(businessJobStageTitle('wire', 'saas'), 'Connecting your data')
    assert.equal(businessJobStageTitle('verify', 'landing'), 'Checking responsiveness')
    assert.equal(businessJobStageTitle('generate', 'landing'), 'Building your website')
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

  it('resolves workspace project states in business order', () => {
    assert.equal(resolveWorkspaceState({}), 'empty')
    assert.equal(resolveWorkspaceState({ jobStatus: 'running', jobStage: 'generate' }), 'building')
    assert.equal(resolveWorkspaceState({ jobStatus: 'running', jobStage: 'deploy' }), 'publishing')
    assert.equal(resolveWorkspaceState({ previewUrl: '/live/abc/' }), 'empty')
    assert.equal(resolveWorkspaceState({ previewReady: true, previewUrl: '/live/abc/' }), 'preview_ready')
    assert.equal(resolveWorkspaceState({ backendReady: true }), 'building')
    assert.equal(
      resolveWorkspaceState({ backendReady: true, previewReady: true, previewUrl: '/live/abc/' }),
      'production_ready',
    )
    assert.equal(
      resolveWorkspaceState({ live: true, liveUrl: 'https://urbanthread.sites.indobase.in' }),
      'live',
    )
    assert.equal(
      resolveWorkspaceState({ jobStatus: 'blocked', failureCode: 'backend_required' }),
      'needs_attention',
    )
  })

  it('humanizes launch failures and never leaks internal codes', () => {
    const fail = humanizeLaunchFailure({
      code: 'backend_required',
      message: 'production verification failed: backend_required',
      repairable: true,
    })
    assert.equal(fail.title, "I couldn't safely launch this yet.")
    assert.match(fail.body, /customer accounts/i)
    assert.doesNotMatch(fail.title + fail.body, /backend_required|production verification failed/i)
    assert.ok(fail.actions.some((a) => a.label === 'Fix it automatically'))
    assert.equal(
      stripInternalFailureCopy('LAUNCH BLOCKED — production verification failed: backend_required'),
      '',
    )
    const stuck = humanizeLaunchFailure({
      code: 'functional_verifier_failed',
      repairable: false,
    })
    assert.ok(stuck.actions.some((a) => a.label === 'Try again'))
    assert.ok(stuck.actions.some((a) => a.label === 'Continue editing'))
    const leaked = humanizeLaunchFailure({
      code: 'unknown_engine',
      message: 'Uncaught TypeError: persistCatalogProjection is not defined http.ts:121:3',
    })
    assert.doesNotMatch(leaked.title + leaked.body, /persistCatalog|is not defined|http\.ts|TypeError/)
  })

  it('workspace view model is state-driven and keeps chat after live', () => {
    const empty = workspaceViewModel({})
    assert.equal(empty.state, 'empty')
    assert.equal(empty.headline, UX_HOME_HEADLINE)
    assert.ok(empty.actions.some((a) => a.label === 'Store'))

    const building = workspaceViewModel({
      jobStatus: 'running',
      appType: 'ecommerce',
      stages: [
        { id: 'classify', status: 'ok' },
        { id: 'provision', status: 'running' },
      ],
    })
    assert.equal(building.state, 'building')
    assert.match(building.headline, /Building your store/)
    assert.equal(building.stages[1]?.label, 'Setting up products & inventory')

    const ready = workspaceViewModel({
      backendReady: true,
      appType: 'ecommerce',
      previewUrl: '/live/x/',
      previewReady: true,
    })
    assert.equal(ready.state, 'production_ready')
    assert.ok(ready.actions.some((a) => /Launch store/i.test(a.label)))

    const live = workspaceViewModel({
      live: true,
      liveUrl: 'https://urbanthread.sites.indobase.in',
      backendReady: true,
      paymentsReady: true,
      appType: 'ecommerce',
    })
    assert.equal(live.state, 'live')
    assert.match(live.headline, /live/i)
    assert.ok(live.actions.some((a) => /Open store/i.test(a.label)))
    assert.ok(live.actions.some((a) => /Manage store/i.test(a.label)))
    assert.match(live.previewHint, /change it|manage the business/i)
    assert.equal(live.showControlCenter, true)
    assert.ok(live.nav.some((n) => n.id === 'products'))
    assert.ok(live.capabilities.includes('commerce'))
  })

  it('click-to-edit messages stay on the chat pipeline', () => {
    const chips = previewEditSuggestions({ type: 'section', id: 'hero', component: 'Hero', label: 'Hero' })
    assert.ok(chips.length <= 3)
    const msg = formatPreviewEditMessage({
      target: { type: 'section', id: 'hero', component: 'Hero' },
      intent: 'modify_copy',
      request: 'Make the headline shorter and more premium.',
    })
    assert.match(msg, /^PREVIEW_EDIT/)
    assert.doesNotMatch(msg, /launchProductionApp|guidedBackend/)
    const click = previewSelectToEditMessage({
      type: 'section',
      id: 'hero',
      component: 'Hero',
      label: 'Hero',
    })
    assert.match(click, /^PREVIEW_EDIT/)
    assert.match(click, /make hero more premium/)
  })

  it('session.project authority wins over local UI guesses', () => {
    const authority = {
      state: 'live' as const,
      kind: 'store' as const,
      capabilities: projectCapabilities({ appType: 'ecommerce', paymentsReady: true }),
      nav: controlCenterNav('store', projectCapabilities({ appType: 'ecommerce', paymentsReady: true })),
    }
    const view = workspaceViewModel({ appType: 'landing', authority })
    assert.equal(view.state, 'live')
    assert.equal(view.kind, 'store')
    assert.ok(view.nav.some((n) => n.id === 'products'))
    assert.ok(!view.nav.some((n) => n.id === 'website'))
    assert.equal(view.showControlCenter, true)
    assert.ok(viewProjectsAuthority(view, authority))
  })
})
