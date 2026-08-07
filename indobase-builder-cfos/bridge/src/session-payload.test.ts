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
  })

  it('composeAgentHintForSession re-asserts guest gate at the front', () => {
    const guest = createGuestSession()
    const hint = composeAgentHintForSession(guest, 'Build a landing page.')
    assert.match(hint, /^GUEST ACCOUNT GATE/)
  })
})
