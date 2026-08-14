import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { findEcommerceVertical } from '../vertical-catalog.ts'
import {
  clearBusinessSpecsForTests,
  inferBusinessSpec,
  intentReadyToBuild,
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
    assert.equal(getBusinessSpec('proj_glow')?.businessName, 'Glow')
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

  it('locks a masala store to food-grocery, never electronics or apparel', () => {
    const spec = inferBusinessSpec('create me a ecommerce site for a masala store')
    assert.equal(spec.businessType, 'ecommerce')
    assert.equal(spec.catalog.verticalId, 'food-grocery')
    assert.notEqual(spec.catalog.verticalId, 'electronics')
    assert.match(spec.businessName, /masala/i)
    assert.equal(findEcommerceVertical(spec.sourceIntent)?.id, 'food-grocery')
  })

  it('does not keep Circuit Nest electronics when the next create is a masala store', () => {
    clearBusinessSpecsForTests()
    rememberBusinessSpec('ws_stale', inferBusinessSpec('Launch an electronics store called Circuit Nest'))
    rememberBusinessSpec('ws_stale', inferBusinessSpec('create me a ecommerce site for a masala store'))
    const spec = getBusinessSpec('ws_stale')
    assert.equal(spec?.catalog.verticalId, 'food-grocery')
    assert.match(spec?.businessName || '', /masala/i)
    assert.notEqual(spec?.businessName, 'Circuit Nest')
    clearBusinessSpecsForTests()
  })

  it('infers SaaS CRM without commerce vertical', () => {
    const spec = inferBusinessSpec('Build a SaaS CRM for small businesses')
    assert.equal(spec.businessType, 'saas')
    assert.notEqual(spec.catalog.verticalId, 'electronics')
  })

  it('infers a robotics website as landing without a store', () => {
    const spec = inferBusinessSpec('Build a website for my robotics company')
    assert.equal(spec.businessType, 'landing')
    assert.match(spec.businessName, /robotics/i)
  })

  it('treats a food ordering website as grocery ecommerce, not a landing page', () => {
    const spec = inferBusinessSpec('build a food ordering website')
    assert.equal(spec.businessType, 'ecommerce')
    assert.equal(spec.catalog.verticalId, 'food-grocery')
    assert.equal(intentReadyToBuild('build a food ordering website'), true)
    assert.equal(inferBusinessSpec('Build a website for my robotics company').businessType, 'landing')
  })

  it('intentReadyToBuild waits for a named vertical or brand, not vague ordering-site asks', () => {
    assert.equal(intentReadyToBuild('Launch a premium sneaker store called UrbanThread'), true)
    assert.equal(intentReadyToBuild('Build me a complete online shop for apparel'), true)
    assert.equal(intentReadyToBuild('Niche Apparel — invent brand (vertical=apparel)'), true)
    assert.equal(
      intentReadyToBuild('I want to launch an ordering site. Infer the rest and start building'),
      false,
    )
    assert.equal(intentReadyToBuild("I'll type my specific niche"), false)
    assert.equal(intentReadyToBuild('This is an online store'), false)
  })
})
