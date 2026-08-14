import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createGuestSession, type Session } from '../auth.ts'
import { planProductionApp, resolveAuthoritativeAppType } from '../production-launch/application-planner.ts'
import { buildSessionApiPayload } from '../session-payload.ts'
import { appTypeToKind } from '../ux-conductor.ts'
import {
  clearBusinessSpecsForTests,
  inferBusinessSpec,
  rememberBusinessSpec,
} from './business-spec.ts'

const member: Session = {
  gotrueId: 'user-1',
  email: 'op@indobase.in',
  projectRef: 'proj_id',
  orgSlug: 'acme',
  projectName: 'Demo',
  studioUrl: 'https://studio.indobase.in',
}

function payloadFor(intent: string, jobType: 'landing' | 'saas' | 'ecommerce') {
  clearBusinessSpecsForTests()
  const spec = inferBusinessSpec(intent)
  rememberBusinessSpec('proj_id', spec)
  return {
    spec,
    payload: buildSessionApiPayload({
      session: member,
      agentHint: 'hint',
      generation: { schemaVersion: 1 },
      agentRuntimeConfigured: true,
      agentRuntimeUrl: 'http://127.0.0.1:8787',
      osProxyPath: '/os/app/',
      indobaseProxyPath: '/api/indobase/proxy/',
      productionJob: {
        appType: jobType,
        status: 'live',
        jobId: 'plj_id',
        url: 'https://example.sites.indobase.in',
        claim_live: true,
        evidence: {},
        stages: [],
        failures: [],
        contract: { capabilities: [] },
      } as never,
    }),
  }
}

describe('BusinessSpec is the sole business-identity authority', () => {
  it('SaaS → Launch app → kind remains saas; name remains TutorDesk', () => {
    const { spec, payload } = payloadFor('Build a SaaS called TutorDesk', 'landing')
    assert.equal(spec.businessType, 'saas')
    assert.equal(spec.businessName, 'TutorDesk')
    assert.equal(payload.runtime.spec?.businessType, 'saas')
    assert.equal(payload.runtime.business.kind, 'saas')
    assert.equal(payload.project.kind, 'saas')
    assert.notEqual(payload.runtime.business.name.toLowerCase(), 'your business')
    assert.equal(
      resolveAuthoritativeAppType({ specType: spec.businessType, jobType: 'landing' }),
      'saas',
    )
  })

  it('website → Launch website → kind remains website', () => {
    const { spec, payload } = payloadFor('Build a landing page called Harbor Studio', 'saas')
    assert.equal(spec.businessType, 'landing')
    assert.equal(payload.runtime.business.kind, 'website')
    assert.equal(payload.project.kind, 'website')
    assert.equal(planProductionApp({ appType: spec.businessType, intent: 'Launch my website' }).appType, 'landing')
  })

  it('ecommerce → Launch store → kind remains ecommerce', () => {
    const { spec, payload } = payloadFor('Build a sneaker store called NorthPeak', 'landing')
    assert.equal(spec.businessType, 'ecommerce')
    assert.equal(payload.runtime.business.kind, 'ecommerce')
    assert.equal(payload.project.kind, 'ecommerce')
    assert.equal(planProductionApp({ appType: spec.businessType, intent: 'Launch my store' }).appType, 'ecommerce')
  })

  it('launch does not overwrite appKind; job metadata cannot mutate identity', () => {
    assert.equal(appTypeToKind('saas'), 'saas')
    assert.equal(
      resolveAuthoritativeAppType({ specType: 'saas', jobType: 'landing' }),
      'saas',
    )
    assert.equal(
      resolveAuthoritativeAppType({ specType: 'ecommerce', jobType: 'landing' }),
      'ecommerce',
    )
  })

  it('guest session does not invent a business identity', () => {
    const guest = createGuestSession()
    const payload = buildSessionApiPayload({
      session: guest,
      agentHint: 'hint',
      generation: { schemaVersion: 1 },
      agentRuntimeConfigured: true,
      agentRuntimeUrl: 'http://127.0.0.1:8787',
      osProxyPath: '/os/app/',
      indobaseProxyPath: '/api/indobase/proxy/',
    })
    assert.equal(payload.runtime.live.isLive, false)
  })
})
