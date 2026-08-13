import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createGuestSession, type Session } from './auth.ts'
import {
  buildAuthVerifySuccessPayload,
  buildOnboardingGate,
  buildSessionApiPayload,
  composeAgentHintForSession,
} from './session-payload.ts'

const signedIn: Session = {
  gotrueId: 'user-1',
  email: 'op@indobase.in',
  projectRef: 'proj_abc',
  orgSlug: 'acme',
  projectName: 'Demo',
  studioUrl: 'https://studio.indobase.in',
}

describe('session-payload', () => {
  it('guest session keeps onboarding gate; signed-in clears it', () => {
    const guest = createGuestSession()
    assert.ok(buildOnboardingGate(guest))
    assert.equal(buildOnboardingGate(guest)?.gate, 'first')
    assert.equal(buildOnboardingGate(signedIn), null)
  })

  it('auth verify success payload clears guest onboarding for clients', () => {
    const body = buildAuthVerifySuccessPayload(signedIn, 'none')
    assert.equal(body.ok, true)
    assert.equal(body.guest, false)
    assert.equal(body.stage, 'member')
    assert.equal(body.onboarding, null)
    assert.equal(body.session_ready, true)
    assert.equal(body.email, 'op@indobase.in')
    assert.equal(body.project_ref, 'proj_abc')
  })

  it('/api/session payload for guest has onboarding + Create account action', () => {
    const guest = createGuestSession()
    const payload = buildSessionApiPayload({
      session: guest,
      agentHint: 'You are operating inside Indobase OS.',
      generation: { schemaVersion: 1 },
      agentRuntimeConfigured: true,
      agentRuntimeUrl: 'http://127.0.0.1:8787',
      osProxyPath: '/os/app/',
      indobaseProxyPath: '/api/indobase/proxy/',
    })
    assert.equal(payload.guest, true)
    assert.equal(payload.stage, 'guest')
    assert.ok(payload.onboarding)
    assert.equal(payload.onboarding?.account_required, true)
    assert.equal(payload.auth.ui, true)
    assert.equal(payload.auth.open_event, 'indobase:open-auth')
    assert.match(payload.agent_hint, /GUEST ACCOUNT GATE/)
    assert.equal(payload.usage.quota, null)
    assert.ok(payload.actions.some((a) => a.id === 'create-account'))
    assert.ok(payload.tools.promptQuota)
  })

  it('/api/session payload for signed-in clears onboarding and exposes quota + Go Live', () => {
    const payload = buildSessionApiPayload({
      session: signedIn,
      agentHint: 'Operator signed in as op@indobase.in.',
      generation: { schemaVersion: 1 },
      agentRuntimeConfigured: true,
      agentRuntimeUrl: 'http://127.0.0.1:8787',
      osProxyPath: '/os/app/',
      indobaseProxyPath: '/api/indobase/proxy/',
      promptQuota: {
        plan: 'free',
        used: 1,
        limit: 5,
        remaining: 4,
        isFree: true,
        organization_slug: 'acme',
        upgradeUrl: '/org/acme/billing?panel=subscriptionPlan',
      },
    })
    assert.equal(payload.guest, false)
    assert.equal(payload.stage, 'member')
    assert.equal(payload.onboarding, null)
    assert.doesNotMatch(payload.agent_hint, /GUEST ACCOUNT GATE/)
    assert.equal(payload.usage.quota?.remaining, 4)
    assert.equal(payload.usage.exhausted, false)
    assert.ok(payload.actions.some((a) => a.id === 'go-live'))
    assert.ok(payload.actions.some((a) => a.id === 'add-login'))
    assert.equal(
      payload.actions.some((a) => a.id === 'create-account'),
      false,
    )
    assert.equal(payload.launch.production, '/api/os/apps/launch')
    assert.equal(payload.tools.launchProductionApp.path, '/api/os/apps/launch')
    assert.match(payload.agent_hint, /Production Launch Job/)
    assert.equal(payload.production_job, null)
    assert.equal(payload.home.headline, 'What do you want to launch?')
    assert.ok(payload.home.tiles.some((t) => t.id === 'launch-saas'))
    assert.ok(payload.home.tiles.some((t) => t.id === 'launch-store'))
    assert.ok(payload.home.tiles.some((t) => t.id === 'launch-landing'))
    assert.equal(payload.tools.promptQuota.check.path, '/api/os/usage/prompt-quota')
    assert.equal(payload.tools.connectGateway.name, 'connectGateway')
    assert.equal(payload.tools.connectGateway.path, '/api/os/tools/connectGateway')
    assert.equal(payload.tools.launchBusiness.name, 'launchBusiness')
    assert.equal(payload.tools.productionChecklist.path, '/api/os/tools/productionChecklist')
    assert.equal('wireCheckout' in payload.tools, false)
    assert.equal('guidedBackend' in payload.tools, false)
    assert.equal(payload.platform_primitives.guidedBackend.path, '/api/os/tools/guidedBackend')
    assert.equal(payload.platform_primitives.ensureLogin.path, '/api/os/tools/ensureLogin')
    assert.equal(payload.platform_primitives.setupShopCatalog.name, 'setupShopCatalog')
    assert.equal(payload.platform_primitives.wireCheckout.path, '/api/os/tools/wireCheckout')
    assert.equal(payload.shop.setup_tool, '/api/os/tools/setupShopCatalog')
    assert.equal(payload.data.apply_schema_tool, '/api/os/tools/applySchema')
    assert.equal(payload.data.guided_backend_tool, '/api/os/tools/guidedBackend')
    assert.equal(payload.data.owner, 'platform_job')
    assert.equal(payload.media.tool, '/api/os/tools/resolveProductImages')
    assert.equal(payload.production.tool, '/api/os/tools/productionChecklist')
    assert.equal(payload.payments.tool, '/api/os/tools/connectGateway')
    assert.equal(payload.payments.wire_checkout_tool, '/api/os/tools/wireCheckout')
    assert.match(payload.agent_hint, /connectGateway/)
    assert.match(payload.agent_hint, /launchProductionApp/)
    assert.match(payload.agent_hint, /Agent tool surface/)
    assert.match(payload.agent_hint, /guidedBackend/)
    assert.match(payload.agent_hint, /Journey state \(session\)/)
    assert.match(payload.agent_hint, /North star \(HARD\)/)
    assert.match(payload.agent_hint, /Preview policy/)
    assert.match(payload.agent_hint, /Journey next_action chip/)
    assert.match(payload.agent_hint, /Catalog: not ready/)
    assert.match(payload.agent_hint, /productionChecklist/)
    assert.ok(payload.journey)
    assert.equal(payload.journey.current_stage, 'preview')
    assert.match(payload.journey.next_action?.label || '', /Start building/i)
    assert.equal(payload.preview.status, 'absent')
    assert.equal(payload.preview.url, null)
    assert.ok(payload.home.tiles.some((t) => t.id === 'launch-booking'))
    assert.match(payload.agent_hint, /UX conductor/)
    assert.ok(payload.project)
    assert.equal(payload.project.state, 'empty')
    assert.ok(Array.isArray(payload.project.nav))
    assert.ok(Array.isArray(payload.project.capabilities))
    assert.ok(typeof payload.project.kind === 'string')
    assert.match(payload.launch.preview_policy || '', /launchProductionApp/)
    assert.equal(payload.launch.enforce_static_over_gadget, true)
    assert.ok(payload.governance?.gateway_not_ready?.choices?.length)
    assert.equal(payload.payments.byok, true)
    assert.ok(payload.actions.some((a) => a.id === 'static-preview'))
  })

  it('composeAgentHintForSession re-asserts guest gate at the front', () => {
    const guest = createGuestSession()
    const hint = composeAgentHintForSession(guest, 'Build a landing page.')
    assert.match(hint, /^GUEST ACCOUNT GATE/)
    assert.match(hint, /Journey state \(session\)/)
  })

  it('journey appendix prefers wire chips when backend is ready', () => {
    const withBackend: Session = {
      ...signedIn,
      backend: {
        anon_key: 'anon',
        api_url: 'https://proj.indobase.in',
        auth_url: 'https://proj.indobase.in/auth/v1',
        project_name: 'Demo',
        project_ref: 'proj_abc',
        project_url: 'https://proj.indobase.in',
        rest_url: 'https://proj.indobase.in/rest/v1',
        storage_url: 'https://proj.indobase.in/storage/v1',
        public_env: { RAZORPAY_KEY_ID: 'rzp_test' },
      },
    }
    const hint = composeAgentHintForSession(withBackend, 'Operator hint.')
    assert.match(hint, /Catalog: not ready/)
    assert.match(hint, /Authoritative state/)
    assert.match(hint, /launchProductionApp|Commerce ABI|window\.indobase\.commerce/)
    assert.match(hint, /Default store ladder/)
    assert.match(hint, /Payments: keys appear configured/)
    assert.match(hint, /Never say the launch service/)
  })
})
