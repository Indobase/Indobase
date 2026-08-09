import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  UPGRADE_PLAN_TOOL,
  assertUpgradePlanHasTarget,
  upgradePlanToolCatalog,
} from './upgrade-plan-tool.ts'

describe('upgradePlan tool', () => {
  it('catalog points at same-origin tool wrapping Platform billing/upgrade-plan', () => {
    const catalog = upgradePlanToolCatalog()
    assert.equal(catalog.name, 'upgradePlan')
    assert.equal(catalog.path, '/api/os/tools/upgradePlan')
    assert.equal(catalog.alias_path, '/api/os/tools/changePlan')
    assert.equal(catalog.wraps, '/api/os/v1/billing/upgrade-plan')
    assert.ok(catalog.aliases.includes('changePlan'))
    assert.ok(catalog.aliases.includes('startPlanUpgrade'))
    assert.equal(UPGRADE_PLAN_TOOL.method, 'POST')
    assert.match(catalog.rules, /checkout_url/)
    assert.match(catalog.rules, /NEVER claim they are on Pro/i)
  })

  it('requires a valid plan ladder target', () => {
    assert.equal(assertUpgradePlanHasTarget({}).ok, false)
    assert.equal(assertUpgradePlanHasTarget({ plan: 'pro' }).ok, true)
    assert.equal(assertUpgradePlanHasTarget({ tier: 'basic' }).ok, true)
    assert.equal(assertUpgradePlanHasTarget({ plan: 'studio' }).ok, true)
    assert.equal(assertUpgradePlanHasTarget({ plan: 'enterprise' }).ok, false)
    assert.equal(assertUpgradePlanHasTarget({ plan: 'free' }).ok, true)
  })
})
