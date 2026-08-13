import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Session } from './auth.js'
import { buildLaunchJourneyState } from './launch-journey.js'
import {
  clearBusinessSpecsForTests,
  inferBusinessSpec,
  rememberBusinessSpec,
} from './ux/business-spec.ts'

function memberSession(): Session {
  return {
    gotrueId: 'user1',
    email: 'founder@example.com',
    projectRef: 'threadline',
    projectName: 'Threadline',
    orgSlug: 'org',
    studioUrl: 'https://studio.indobase.in',
    backend: {
      api_url: 'https://backend.indobase.in',
      auth_url: 'https://backend.indobase.in/api/collections/users',
      rest_url: 'https://backend.indobase.in/api/collections',
      storage_url: 'https://backend.indobase.in/api/files',
      project_ref: 'threadline',
      project_name: 'Threadline',
      anon_key: 'public',
    },
  }
}

describe('buildLaunchJourneyState', () => {
  it('guests get account stage and signup CTA', () => {
    const journey = buildLaunchJourneyState({
      gotrueId: 'guest',
      email: '',
      projectRef: 'draft1',
      projectName: 'Draft',
      orgSlug: 'org',
      studioUrl: 'https://studio.indobase.in',
    })
    assert.equal(journey.guest, true)
    assert.equal(journey.current_stage, 'account')
    assert.match(journey.next_action?.label || '', /Create account/i)
    assert.doesNotMatch(journey.next_action?.message || '', /POST \/api|guidedBackend/i)
  })

  it('signed-in without a real preview stays on preview — managed backend is not a store', () => {
    const journey = buildLaunchJourneyState(memberSession(), {})
    assert.equal(journey.current_stage, 'preview')
    assert.match(journey.next_action?.label || '', /Start building/i)
    assert.equal(journey.backend_ready, false)
    assert.equal(journey.stages.find((s) => s.id === 'preview')?.status, 'current')
    assert.doesNotMatch(journey.next_action?.message || '', /POST \/api|guidedBackend/i)
  })

  it('confirmed preview for a SaaS spec offers Launch app, not Launch store', () => {
    rememberBusinessSpec('threadline', inferBusinessSpec('Build a saas application called Northwind'))
    const journey = buildLaunchJourneyState(memberSession(), {
      previewReady: true,
      previewUrl: 'https://builder.indobase.in/live/threadline/',
    })
    assert.match(journey.next_action?.label || '', /Launch app/i)
    assert.doesNotMatch(journey.next_action?.label || '', /store/i)
    assert.match(journey.headline || '', /app/i)
    clearBusinessSpecsForTests()
  })

  it('confirmed preview without publish offers Launch store', () => {
    const journey = buildLaunchJourneyState(memberSession(), {
      previewReady: true,
      previewUrl: 'https://builder.indobase.in/live/threadline/',
      catalogReady: true,
    })
    assert.equal(journey.current_stage, 'live')
    assert.match(journey.next_action?.label || '', /Launch store/i)
    assert.equal(journey.backend_ready, true)
    assert.ok(journey.completed_stages.includes('preview'))
  })

  it('live site advances to Add payments (domain is secondary chip)', () => {
    const journey = buildLaunchJourneyState(memberSession(), {
      subdomain: 'threadline',
      url: 'https://threadline.sites.indobase.in',
      catalogReady: true,
      previewReady: true,
    })
    assert.equal(journey.current_stage, 'payments')
    assert.equal(journey.live_url, 'https://threadline.sites.indobase.in')
    assert.match(journey.next_action?.label || '', /Connect payments/i)
    assert.match(journey.headline || '', /payments/i)
    assert.doesNotMatch(journey.headline || '', /backend|checklist/i)
    assert.equal(journey.flags.is_live, true)
    assert.ok(journey.completed_stages.includes('live'))
    assert.ok(journey.completed_stages.includes('backend'))
    const payments = journey.stages.find((s) => s.id === 'payments')
    assert.equal(payments?.status, 'current')
  })

  it('live without backend current is backend with backend headline', () => {
    const journey = buildLaunchJourneyState(
      {
        gotrueId: 'user1',
        email: 'founder@example.com',
        projectRef: 'staticshop',
        projectName: 'Static Shop',
        orgSlug: 'org',
        studioUrl: 'https://studio.indobase.in',
      },
      {
        subdomain: 'staticshop',
        url: 'https://staticshop.sites.indobase.in',
      },
    )
    assert.equal(journey.current_stage, 'backend')
    assert.equal(journey.flags.is_live, true)
    assert.equal(journey.flags.is_backend_ready, false)
    assert.match(journey.next_action?.label || '', /Connect products/i)
    assert.match(journey.headline || '', /connect products/i)
    assert.doesNotMatch(journey.headline || '', /backend/i)
    const backend = journey.stages.find((s) => s.id === 'backend')
    assert.equal(backend?.status, 'current')
    const payments = journey.stages.find((s) => s.id === 'payments')
    assert.equal(payments?.status, 'upcoming')
  })

  it('production done when live + backend + payments ready', () => {
    const session = memberSession()
    session.backend = {
      ...session.backend!,
      public_env: {
        PAYMENTS_READY: '1',
        GATEWAY_KEYS: 'razorpay',
      },
    }
    const journey = buildLaunchJourneyState(session, {
      subdomain: 'threadline',
      url: 'https://threadline.sites.indobase.in',
      catalogReady: true,
      previewReady: true,
    })
    assert.equal(journey.current_stage, 'production')
    assert.equal(journey.flags.is_production_ready, true)
    assert.equal(journey.flags.is_payments_ready, true)
    const production = journey.stages.find((s) => s.id === 'production')
    assert.equal(production?.status, 'done')
    assert.match(journey.next_action?.label || '', /Open store|Manage store/i)
    assert.match(journey.headline || '', /is live/i)
    assert.doesNotMatch(journey.headline || '', /checklist|backend/i)
  })

  it('signed-in without backend leaves Preview upcoming', () => {
    const journey = buildLaunchJourneyState(
      {
        gotrueId: 'user1',
        email: 'founder@example.com',
        projectRef: 'newshop',
        projectName: 'New Shop',
        orgSlug: 'org',
        studioUrl: 'https://studio.indobase.in',
      },
      {},
    )
    const preview = journey.stages.find((s) => s.id === 'preview')
    assert.equal(preview?.status, 'current')
    assert.equal(journey.current_stage, 'preview')
    assert.equal(journey.flags.is_live, false)
  })
})
