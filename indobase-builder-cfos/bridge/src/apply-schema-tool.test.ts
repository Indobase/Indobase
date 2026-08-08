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
    assert.match(ENSURE_CAPABILITY_AGENT_HARD_RULES, /ensureLogin/)
    assert.match(ENSURE_CAPABILITY_AGENT_HARD_RULES, /ensureEmail/)
    assert.match(ENSURE_CAPABILITY_AGENT_HARD_RULES, /ensureAnalytics/)
    assert.match(ENSURE_CAPABILITY_AGENT_HARD_RULES, /applySchema/)
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
    assert.match(APPLY_SCHEMA_AGENT_HARD_RULES, /ensureDatabase/)
    assert.match(APPLY_SCHEMA_AGENT_HARD_RULES, /Do not send arbitrary SQL|declarative/i)
  })

  it('productionChecklist is the claim gate', () => {
    const catalog = productionChecklistToolCatalog()
    assert.equal(catalog.path, '/api/os/tools/productionChecklist')
    assert.match(PRODUCTION_CHECKLIST_AGENT_HARD_RULES, /claim_production_ready/)
    assert.match(PRODUCTION_CHECKLIST_AGENT_HARD_RULES, /any web application/i)
  })
})
