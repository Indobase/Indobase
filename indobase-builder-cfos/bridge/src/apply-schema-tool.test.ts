import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  APPLY_SCHEMA_AGENT_HARD_RULES,
  applySchemaToolCatalog,
} from './apply-schema-tool.ts'
import {
  ENSURE_CAPABILITY_AGENT_HARD_RULES,
  ensureAnalyticsToolCatalog,
  ensureDatabaseToolCatalog,
  ensureEmailToolCatalog,
  ensureLoginToolCatalog,
} from './ensure-capability-tool.ts'
import {
  PRODUCTION_CHECKLIST_AGENT_HARD_RULES,
  productionChecklistToolCatalog,
} from './production-checklist-tool.ts'
import {
  PRODUCT_IMAGES_AGENT_HARD_RULES,
  resolveProductImagesToolCatalog,
} from './product-images-tool.ts'

describe('general web-app production tools', () => {
  it('ensureLogin / ensureDatabase / email / analytics wrap runtime ensure', () => {
    assert.equal(ensureLoginToolCatalog().path, '/api/os/tools/ensureLogin')
    assert.equal(ensureDatabaseToolCatalog().path, '/api/os/tools/ensureDatabase')
    assert.equal(ensureEmailToolCatalog().path, '/api/os/tools/ensureEmail')
    assert.equal(ensureAnalyticsToolCatalog().path, '/api/os/tools/ensureAnalytics')
    assert.match(ENSURE_CAPABILITY_AGENT_HARD_RULES, /Not agent tools/i)
    assert.match(ENSURE_CAPABILITY_AGENT_HARD_RULES, /must not call/)
    assert.match(ensureAnalyticsToolCatalog().description, /unavailable|stripped/i)
  })

  it('guidedBackend catalog stays internal and does not instruct the agent to call it', async () => {
    const { GUIDED_BACKEND_AGENT_HARD_RULES, guidedBackendToolCatalog } = await import(
      './guided-backend-chain.ts'
    )
    const catalog = guidedBackendToolCatalog()
    assert.equal(catalog.name, 'guidedBackend')
    assert.equal(catalog.path, '/api/os/tools/guidedBackend')
    assert.match(GUIDED_BACKEND_AGENT_HARD_RULES, /Not an agent tool/i)
    assert.match(GUIDED_BACKEND_AGENT_HARD_RULES, /must not name or call/i)
    assert.doesNotMatch(GUIDED_BACKEND_AGENT_HARD_RULES, /Call \*\*guidedBackend|then call \*\*guidedBackend/i)
  })

  it('resolveProductImages points at OS media tool', () => {
    const catalog = resolveProductImagesToolCatalog()
    assert.equal(catalog.name, 'resolveProductImages')
    assert.equal(catalog.path, '/api/os/tools/resolveProductImages')
    assert.match(PRODUCT_IMAGES_AGENT_HARD_RULES, /resolveProductImages/)
    assert.match(PRODUCT_IMAGES_AGENT_HARD_RULES, /Openverse|setupShopCatalog/)
  })

  it('applySchema catalog is declarative (no arbitrary SQL)', () => {
    const catalog = applySchemaToolCatalog()
    assert.equal(catalog.name, 'applySchema')
    assert.equal(catalog.path, '/api/os/tools/applySchema')
    assert.match(APPLY_SCHEMA_AGENT_HARD_RULES, /Not an agent tool/i)
    assert.match(APPLY_SCHEMA_AGENT_HARD_RULES, /declarative/i)
  })

  it('productionChecklist is the claim gate', () => {
    const catalog = productionChecklistToolCatalog()
    assert.equal(catalog.path, '/api/os/tools/productionChecklist')
    assert.match(PRODUCTION_CHECKLIST_AGENT_HARD_RULES, /claim_production_ready/)
    assert.match(PRODUCTION_CHECKLIST_AGENT_HARD_RULES, /any web application/i)
  })
})
