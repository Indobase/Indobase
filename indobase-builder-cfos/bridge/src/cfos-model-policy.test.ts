import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  CFOS_APPROVED_MODELS,
  CFOS_CHAT_MODEL,
  CFOS_CODE_MODEL,
  CFOS_ORG_MODEL,
  classifyOperatorMessageTask,
  failoverOrderForTask,
  isApprovedCfosModelId,
  isRateLimitErrorMessage,
  nextFailoverModel,
  pickApprovedModel,
  preferredCfosModelId,
  quickCfosModelId,
  resolveCfosModelForTask,
} from './cfos-model-policy.js'

describe('cfos-model-policy', () => {
  it('approves curated pool and rejects gpt-3.5-turbo', () => {
    assert.equal(isApprovedCfosModelId(CFOS_CODE_MODEL), true)
    assert.equal(isApprovedCfosModelId(CFOS_ORG_MODEL), true)
    assert.equal(isApprovedCfosModelId(CFOS_CHAT_MODEL), true)
    assert.equal(isApprovedCfosModelId('openai/gpt-3.5-turbo'), false)
    assert.equal(isApprovedCfosModelId('openai/gpt-4o-mini'), false)
    assert.ok(CFOS_APPROVED_MODELS.length >= 3)
  })

  it('routes code/org/chat to quality vs cheap models', () => {
    assert.equal(resolveCfosModelForTask('code'), CFOS_CODE_MODEL)
    assert.equal(resolveCfosModelForTask('org'), CFOS_ORG_MODEL)
    assert.equal(resolveCfosModelForTask('chat'), CFOS_CHAT_MODEL)
    assert.equal(preferredCfosModelId(), CFOS_CODE_MODEL)
    assert.equal(quickCfosModelId(), CFOS_ORG_MODEL)
  })

  it('never picks unapproved models[0] when approved pool is present', () => {
    const available = [
      { id: 'openai/gpt-3.5-turbo' },
      { id: CFOS_CHAT_MODEL },
      { id: CFOS_CODE_MODEL },
    ]
    assert.equal(pickApprovedModel(available, 'code'), CFOS_CODE_MODEL)
    assert.equal(pickApprovedModel(available, 'chat'), CFOS_CHAT_MODEL)
  })

  it('returns null when only junk models exist', () => {
    assert.equal(pickApprovedModel([{ id: 'openai/gpt-3.5-turbo' }], 'code'), null)
  })

  it('failovers away from rate-limited model', () => {
    assert.equal(nextFailoverModel(CFOS_CODE_MODEL, 'code'), CFOS_ORG_MODEL)
    assert.ok(isRateLimitErrorMessage('rate_limit_exceeded: openai/gpt-3.5-turbo'))
    assert.ok(isRateLimitErrorMessage('temporarily rate-limited upstream'))
    assert.equal(isRateLimitErrorMessage('syntax error'), false)
  })

  it('classifies operator messages into chat/org/code', () => {
    assert.equal(classifyOperatorMessageTask('create online store for my samosa shop'), 'code')
    assert.equal(classifyOperatorMessageTask('build the storefront html'), 'code')
    assert.equal(classifyOperatorMessageTask('connect razorpay payments'), 'org')
    assert.equal(classifyOperatorMessageTask('which niche should I pick?'), 'chat')
  })

  it('code failover order prefers Luna first', () => {
    assert.equal(failoverOrderForTask('code')[0], CFOS_CODE_MODEL)
  })
})
