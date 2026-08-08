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
    assert.ok(payload.onboarding)
    assert.equal(payload.onboarding?.account_required, true)
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
    assert.equal(payload.tools.promptQuota.check.path, '/api/os/usage/prompt-quota')
    assert.equal(payload.tools.connectGateway.name, 'connectGateway')
    assert.equal(payload.tools.connectGateway.path, '/api/os/tools/connectGateway')
    assert.equal(payload.tools.wireCheckout.name, 'wireCheckout')
    assert.equal(payload.tools.wireCheckout.path, '/api/os/tools/wireCheckout')
    assert.equal(payload.tools.setupShopCatalog.name, 'setupShopCatalog')
    assert.equal(payload.tools.listShopOrders.path, '/api/os/tools/listShopOrders')
    assert.equal(payload.tools.ensureLogin.path, '/api/os/tools/ensureLogin')
    assert.equal(payload.tools.ensureDatabase.path, '/api/os/tools/ensureDatabase')
    assert.equal(payload.tools.ensureEmail.path, '/api/os/tools/ensureEmail')
    assert.equal(payload.tools.ensureAnalytics.path, '/api/os/tools/ensureAnalytics')
    assert.equal(payload.tools.resolveProductImages.path, '/api/os/tools/resolveProductImages')
    assert.equal(payload.tools.applySchema.path, '/api/os/tools/applySchema')
    assert.equal(payload.tools.productionChecklist.path, '/api/os/tools/productionChecklist')
    assert.equal(payload.shop.setup_tool, '/api/os/tools/setupShopCatalog')
    assert.equal(payload.data.apply_schema_tool, '/api/os/tools/applySchema')
    assert.equal(payload.media.tool, '/api/os/tools/resolveProductImages')
    assert.equal(payload.production.tool, '/api/os/tools/productionChecklist')
    assert.equal(payload.payments.tool, '/api/os/tools/connectGateway')
    assert.equal(payload.payments.wire_checkout_tool, '/api/os/tools/wireCheckout')
    assert.match(payload.agent_hint, /connectGateway/)
    assert.match(payload.agent_hint, /wireCheckout/)
    assert.match(payload.agent_hint, /setupShopCatalog/)
    assert.match(payload.agent_hint, /resolveProductImages/)
    assert.match(payload.agent_hint, /applySchema/)
    assert.match(payload.agent_hint, /productionChecklist/)
  })

  it('composeAgentHintForSession re-asserts guest gate at the front', () => {
    const guest = createGuestSession()
    const hint = composeAgentHintForSession(guest, 'Build a landing page.')
    assert.match(hint, /^GUEST ACCOUNT GATE/)
  })
})
