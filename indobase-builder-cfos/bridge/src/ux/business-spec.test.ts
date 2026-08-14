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

  it('infers SaaS from a saas/application prompt, not a store', () => {
    assert.equal(inferBusinessSpec('Build a saas application').businessType, 'saas')
    assert.equal(inferBusinessSpec('I want to launch a SaaS app with customer accounts').businessType, 'saas')
    assert.equal(inferBusinessSpec('Build me an application with login').businessType, 'saas')
    assert.equal(inferBusinessSpec('Launch a premium sneaker store called UrbanThread').businessType, 'ecommerce')
  })

  it('infers landing from a website prompt, not a store', () => {
    const spec = inferBusinessSpec('Build a website called Harbor Studio')
    assert.equal(spec.businessName, 'Harbor Studio')
    assert.equal(spec.businessType, 'landing')
    assert.equal(inferBusinessSpec('Launch my website').businessType, 'landing')
    assert.equal(inferBusinessSpec('I want a landing page for my brand').businessType, 'landing')
    assert.equal(inferBusinessSpec('Launch a website to sell sneakers').businessType, 'ecommerce')
  })

  it('extracts Call it TutorDesk and refuses a leftover placeholder name', () => {
    const spec = inferBusinessSpec('Build a SaaS invoicing app. Call it TutorDesk')
    assert.equal(spec.businessName, 'TutorDesk')
    assert.equal(spec.businessType, 'saas')
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
