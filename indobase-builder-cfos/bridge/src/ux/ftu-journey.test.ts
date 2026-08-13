import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { AGENT_FACING_TOOL_NAMES } from '../production-launch/agent-surface.js'
import {
  INTERNAL_OPERATOR_LEXICON,
  certifyFtuLogic,
  ftuMetricScores,
  FTU_CERT_VERSION,
  FTU_ECOMMERCE_STEPS,
  FTU_LIVE_CERT_ITEMS,
  FTU_RECOVERY_CASES,
} from './ftu-journey.ts'

describe('first-time user journey certification', () => {
  it('covers the 16-step ecommerce path and four metrics', () => {
    assert.equal(FTU_CERT_VERSION, 'ftu-journey/v1')
    assert.equal(FTU_ECOMMERCE_STEPS.length, 16)
    assert.equal(FTU_LIVE_CERT_ITEMS.length, 20)
    assert.equal(FTU_RECOVERY_CASES.length, 7)
    assert.equal(FTU_ECOMMERCE_STEPS[0]?.id, 'FTU-01')
    assert.equal(FTU_ECOMMERCE_STEPS[15]?.id, 'FTU-16')
    assert.equal(FTU_LIVE_CERT_ITEMS[9]?.label, 'Control Center authentication')
    assert.equal(FTU_LIVE_CERT_ITEMS[10]?.label, 'Cross-project isolation')
  })

  it('logic cert passes: completion, cognitive load, no agent correction, recovery', () => {
    const report = certifyFtuLogic()
    const scores = ftuMetricScores(report.checks)
    const failed = report.checks.filter((c) => !c.ok)
    assert.equal(failed.length, 0, failed.map((c) => `${c.id}: ${c.detail}`).join('; '))
    assert.equal(report.certified, true)
    assert.ok(scores.completion.pass === scores.completion.total && scores.completion.total > 0)
    assert.ok(scores.cognitive_load.pass === scores.cognitive_load.total && scores.cognitive_load.total > 0)
    assert.ok(scores.agent_intervention.pass === scores.agent_intervention.total)
    assert.ok(scores.recovery.pass === scores.recovery.total && scores.recovery.total >= 7)
  })

  it('operator lexicon never includes Indobase internals', () => {
    assert.match('backend', INTERNAL_OPERATOR_LEXICON)
    assert.match('Commerce ABI', INTERNAL_OPERATOR_LEXICON)
    assert.match('Studio', INTERNAL_OPERATOR_LEXICON)
    assert.match('tenant', INTERNAL_OPERATOR_LEXICON)
    assert.match('provisioner', INTERNAL_OPERATOR_LEXICON)
    assert.match('PocketBase', INTERNAL_OPERATOR_LEXICON)
    assert.doesNotMatch('Launch my store', INTERNAL_OPERATOR_LEXICON)
    assert.doesNotMatch('Your store is live', INTERNAL_OPERATOR_LEXICON)
    assert.doesNotMatch('Customer login is enabled', INTERNAL_OPERATOR_LEXICON)
  })

  it('does not expand the frozen five-tool surface', () => {
    assert.equal(AGENT_FACING_TOOL_NAMES.length, 5)
  })
})
