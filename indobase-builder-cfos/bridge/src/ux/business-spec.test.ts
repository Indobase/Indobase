import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { findEcommerceVertical } from '../vertical-catalog.ts'
import {
  clearBusinessSpecsForTests,
  inferBusinessSpec,
  rememberBusinessSpec,
  getBusinessSpec,
} from './business-spec.ts'

describe('BusinessSpec', () => {
  it('keeps a premium sneaker store as sneakers, not apparel', () => {
    const spec = inferBusinessSpec('Launch a premium sneaker store called UrbanThread')
    assert.equal(spec.businessName, 'UrbanThread')
    assert.equal(spec.businessType, 'ecommerce')
    assert.equal(spec.catalog.verticalId, 'sneakers')
    assert.match(spec.catalog.category, /sneaker/i)
    assert.match(spec.visualStyle, /premium/)
    assert.equal(spec.currency, 'INR')
    assert.equal(findEcommerceVertical(spec.sourceIntent)?.id, 'sneakers')
    assert.equal(findEcommerceVertical('sneakers')?.products?.[0]?.name, 'Apex Runner')
  })

  it('does not let apparel win on a sneaker prompt', () => {
    assert.equal(findEcommerceVertical('UrbanThread premium sneakers')?.id, 'sneakers')
    assert.equal(findEcommerceVertical('apparel')?.id, 'apparel')
  })

  it('persists per project', () => {
    clearBusinessSpecsForTests()
    const spec = inferBusinessSpec('Launch a beauty shop called Glow')
    rememberBusinessSpec('proj_glow', spec)
    assert.equal(getBusinessSpec('proj_glow')?.businessName, 'Glow')
    assert.equal(getBusinessSpec('proj_glow')?.catalog.verticalId, 'beauty')
    clearBusinessSpecsForTests()
    assert.equal(getBusinessSpec('proj_glow'), null)
  })

  it('infers UrbanThread from lowercase, quoted, and markdown called-X', () => {
    assert.equal(inferBusinessSpec('launch a premium sneaker store called urbanthread').businessName, 'Urbanthread')
    assert.equal(inferBusinessSpec('Launch a premium sneaker store called "UrbanThread"').businessName, 'UrbanThread')
    assert.equal(inferBusinessSpec('Launch a premium sneaker store called **UrbanThread**').businessName, 'UrbanThread')
    assert.notEqual(
      inferBusinessSpec('Launch a premium sneaker store called UrbanThread').businessName,
      'your business',
    )
    assert.equal(
      inferBusinessSpec('Launch a premium sneaker store called UrbanThread\nGo Live').businessName,
      'UrbanThread',
    )
  })

  it('does not let a placeholder name overwrite UrbanThread', () => {
    clearBusinessSpecsForTests()
    rememberBusinessSpec('proj_ut', inferBusinessSpec('Launch a premium sneaker store called UrbanThread'))
    rememberBusinessSpec('proj_ut', inferBusinessSpec('Go Live'))
    assert.equal(getBusinessSpec('proj_ut')?.businessName, 'UrbanThread')
    clearBusinessSpecsForTests()
  })
})
