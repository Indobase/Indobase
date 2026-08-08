import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  BRIDGE_PROMPT_QUOTA_PATH,
  buildSessionPromptQuotaBlock,
  interpretPromptQuotaResponse,
  isPromptQuotaExhausted,
  promptQuotaToolCatalog,
  upgradeCopyForQuota,
} from './prompt-quota.ts'

describe('prompt-quota helpers', () => {
  it('detects exhausted Free meter', () => {
    assert.equal(
      isPromptQuotaExhausted({ isFree: true, remaining: 0, limit: 5 }),
      true,
    )
    assert.equal(
      isPromptQuotaExhausted({ isFree: true, remaining: 2, limit: 5 }),
      false,
    )
    assert.equal(
      isPromptQuotaExhausted({ isFree: false, remaining: 0, limit: null }),
      false,
    )
  })

  it('builds session usage block with upgrade copy', () => {
    const block = buildSessionPromptQuotaBlock({
      plan: 'free',
      used: 5,
      limit: 5,
      remaining: 0,
      isFree: true,
      organization_slug: 'acme',
      upgradeUrl: '/org/acme/billing?panel=subscriptionPlan',
    })
    assert.equal(block.path, BRIDGE_PROMPT_QUOTA_PATH)
    assert.equal(block.exhausted, true)
    assert.match(block.upgrade_copy, /Free agent limit/)
    assert.match(block.upgrade_copy, /\/org\/acme\/billing/)
    assert.match(block.note, /begin-turn|GET check|POST consume/i)
  })

  it('interprets 402 exhausted responses for agents', () => {
    const result = interpretPromptQuotaResponse(402, {
      ok: false,
      code: 'prompt_quota_exceeded',
      message: 'Free agent limit reached (5 prompts). Upgrade your plan to continue.',
      quota: {
        plan: 'free',
        used: 5,
        limit: 5,
        remaining: 0,
        isFree: true,
        organization_slug: 'acme',
        upgradeUrl: '/org/acme/billing?panel=subscriptionPlan',
      },
    })
    assert.equal(result.ok, false)
    assert.equal(result.exhausted, true)
    assert.equal(result.code, 'prompt_quota_exceeded')
    assert.match(result.operatorMessage || '', /Upgrade/)
  })

  it('interprets account_required for guests', () => {
    const result = interpretPromptQuotaResponse(403, {
      ok: false,
      code: 'account_required',
      message: 'Create your Indobase account before using agent prompts.',
    })
    assert.equal(result.ok, false)
    assert.equal(result.exhausted, false)
    assert.equal(result.code, 'account_required')
  })

  it('exposes tool catalog for /api/session.tools', () => {
    const catalog = promptQuotaToolCatalog()
    assert.equal(catalog.name, 'promptQuota')
    assert.equal(catalog.check.path, BRIDGE_PROMPT_QUOTA_PATH)
    assert.equal(catalog.consume.method, 'POST')
  })

  it('upgradeCopyForQuota falls back without url', () => {
    assert.match(upgradeCopyForQuota(null), /Free agent limit/)
  })
})
