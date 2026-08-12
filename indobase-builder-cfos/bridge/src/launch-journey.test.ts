import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Session } from './auth.js'
import { buildLaunchJourneyState } from './launch-journey.js'

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
  })

  it('signed-in without publish pushes Go Live first', () => {
    const journey = buildLaunchJourneyState(memberSession(), {})
    assert.equal(journey.current_stage, 'live')
    assert.match(journey.next_action?.label || '', /Go Live/i)
    assert.equal(journey.backend_ready, true)
  })

  it('live site without custom domain pushes Connect domain first', () => {
    const journey = buildLaunchJourneyState(memberSession(), {
      subdomain: 'threadline',
      url: 'https://threadline.sites.indobase.in',
    })
    assert.equal(journey.current_stage, 'payments')
    assert.equal(journey.live_url, 'https://threadline.sites.indobase.in')
    assert.match(journey.next_action?.label || '', /Connect my domain/i)
    assert.match(journey.next_action?.message || '', /CNAME|sites\.indobase\.in|auto-verify/i)
    assert.equal(journey.flags.is_live, true)
    assert.ok(journey.completed_stages.includes('live'))
    assert.ok(journey.completed_stages.includes('backend'))
  })

  it('live site with custom domain advances to Add payments', () => {
    const journey = buildLaunchJourneyState(memberSession(), {
      subdomain: 'threadline',
      customDomain: 'www.threadline.com',
      url: 'https://www.threadline.com',
    })
    assert.equal(journey.current_stage, 'payments')
    assert.match(journey.next_action?.label || '', /Add payments/i)
  })
})
