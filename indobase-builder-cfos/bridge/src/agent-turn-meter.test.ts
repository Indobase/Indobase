import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  BRIDGE_AGENT_BEGIN_TURN_PATH,
  interpretBeginTurnResult,
  shouldConsumeAgentTurn,
} from './agent-turn-meter.ts'

describe('agent-turn-meter', () => {
  it('skips empty messages', () => {
    assert.equal(shouldConsumeAgentTurn({ message: undefined }), false)
    assert.equal(shouldConsumeAgentTurn({ message: '' }), false)
    assert.equal(shouldConsumeAgentTurn({ message: '   ' }), false)
  })

  it('consumes non-empty user sends by default', () => {
    assert.equal(shouldConsumeAgentTurn({ message: 'build a landing page' }), true)
    assert.equal(shouldConsumeAgentTurn({ message: 'hi' }), true)
  })

  it('skips orchestrator / internal markers', () => {
    assert.equal(
      shouldConsumeAgentTurn({ message: '[Orchestrator Agent] repair preview' }),
      false,
    )
    assert.equal(
      shouldConsumeAgentTurn({ message: 'note [Internal Agent] sync' }),
      false,
    )
    assert.equal(
      shouldConsumeAgentTurn({ message: '[indobase:internal] heartbeat' }),
      false,
    )
  })

  it('interprets 402 exhausted', () => {
    const result = interpretBeginTurnResult(402, {
      ok: false,
      code: 'prompt_quota_exceeded',
      message: 'Free agent limit reached (5 prompts). Upgrade your plan to continue.',
      quota: { remaining: 0, isFree: true },
    })
    assert.equal(result.ok, false)
    assert.equal(result.exhausted, true)
    assert.equal(result.accountRequired, false)
    assert.equal(result.code, 'prompt_quota_exceeded')
    assert.equal(result.httpStatus, 402)
    assert.match(result.message || '', /Upgrade/)
  })

  it('interprets 403 account_required', () => {
    const result = interpretBeginTurnResult(403, {
      ok: false,
      code: 'account_required',
      message: 'Create your Indobase account first.',
    })
    assert.equal(result.ok, false)
    assert.equal(result.exhausted, false)
    assert.equal(result.accountRequired, true)
    assert.equal(result.code, 'account_required')
    assert.equal(result.httpStatus, 403)
  })

  it('exposes begin-turn path constant', () => {
    assert.equal(BRIDGE_AGENT_BEGIN_TURN_PATH, '/api/os/agent/begin-turn')
  })
})
