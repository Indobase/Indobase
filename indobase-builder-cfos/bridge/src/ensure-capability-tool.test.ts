import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  ANALYTICS_UNAVAILABLE_CODE,
  ANALYTICS_UNAVAILABLE_MESSAGE,
  executeEnsureAnalytics,
} from './ensure-capability-tool.ts'

describe('executeEnsureAnalytics (CFOS soft-disable)', () => {
  it('returns pending_setup without claiming ready or calling Studio', async () => {
    const result = await executeEnsureAnalytics({
      gotrueId: 'user-1',
      email: 'op@example.com',
      projectRef: 'proj_demo',
    })
    assert.equal(result.ok, true)
    assert.equal(result.claim_analytics_ready, false)
    assert.equal(result.setup_status, 'pending')
    assert.equal(result.launch_url, null)
    assert.equal(result.code, ANALYTICS_UNAVAILABLE_CODE)
    assert.equal(result.message, ANALYTICS_UNAVAILABLE_MESSAGE)
    assert.equal(result.httpStatus, 200)
  })
})
