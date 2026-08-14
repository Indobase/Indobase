import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { capabilityPlanFromBusinessType } from '../../../../packages/platform/src/business/application-engine.ts'
import { verifyPreviewHttp } from '../../../../packages/platform/src/business/verification.ts'

import { inferBusinessSpec, mergeBusinessSpec, rememberBusinessSpec, sealBusinessSpec, clearBusinessSpecsForTests } from './business-spec.ts'
import { designTokensFromSpec } from './design-system.ts'
import { buildPreviewFiles } from './preview-artifact.ts'
import { classifyOperatorIntent, turnClassForIntent } from './execution-contract.ts'

describe('Gen3 application contract', () => {
  it('builds a masala storefront that is not Circuit Nest or electronics', () => {
    const spec = inferBusinessSpec('create me a ecommerce site for a masala store')
    const files = buildPreviewFiles(spec, 'proj_masala_a')
    const html = files['index.html'] || ''
    assert.match(html, /masala/i)
    assert.doesNotMatch(html, /Circuit Nest/)
    assert.doesNotMatch(html, /corev1-aug13/)
    assert.match(html, /data-ib-project="proj_masala_a"/)
    assert.match(html, /data-ib-vertical="food-grocery"/)
    assert.match(html, /indobase\.commerce|\/api\/os\/commerce/)
    assert.doesNotMatch(html, /--accent:#3B8FD6/)
    assert.match(html, /data-ib-design=/)
    assert.doesNotMatch(html, /buildManagedShopStorefrontHtml/)
    const tokens = designTokensFromSpec(spec)
    assert.notEqual(tokens.accent.toLowerCase(), '#3b8fd6')
    const catalog = html.toLowerCase()
    assert.match(catalog, /masala|turmeric|spice|basmati|grocery/)
    assert.doesNotMatch(catalog, /pulse headphone|apex runner/)
  })

  it('isolates two workspaces by projectRef and artifact identity', () => {
    const a = inferBusinessSpec('create me a ecommerce site for a masala store')
    const b = inferBusinessSpec('Launch an electronics store called Circuit Nest')
    const filesA = buildPreviewFiles(a, 'proj_a')
    const filesB = buildPreviewFiles(b, 'proj_b')
    assert.notEqual(filesA['index.html'], filesB['index.html'])
    assert.match(filesA['index.html'] || '', /proj_a/)
    assert.match(filesB['index.html'] || '', /proj_b/)
    assert.notEqual(a.catalog.verticalId, b.catalog.verticalId)
  })

  it('does not classify a create prompt as production launch', () => {
    const intent = classifyOperatorIntent('create me a ecommerce site for a masala store', null)
    assert.equal(intent, 'create_business')
    assert.equal(turnClassForIntent(intent), 'build')
  })

  it('plans SaaS CRM without ecommerce catalog pages as the business type', () => {
    const spec = inferBusinessSpec('Build a SaaS CRM for small businesses')
    const plan = capabilityPlanFromBusinessType(spec.businessType)
    assert.equal(plan.businessType, 'saas')
    assert.ok(plan.requiredCapabilities.includes('auth'))
    assert.ok(plan.pages.includes('dashboard'))
    assert.equal(plan.kernel, 'saas-v1')
    const html = buildPreviewFiles(spec, 'proj_crm')['index.html'] || ''
    assert.doesNotMatch(html, /id="openCart"|Checkout/)
  })

  it('plans a robotics website as landing without commerce ABI', () => {
    const spec = inferBusinessSpec('Build a website for my robotics company')
    const plan = capabilityPlanFromBusinessType(spec.businessType)
    assert.equal(plan.businessType, 'landing')
    const html = buildPreviewFiles(spec, 'proj_robotics')['index.html'] || ''
    assert.doesNotMatch(html, /indobase\.commerce/)
    assert.doesNotMatch(html, /Circuit Nest/)
  })

  it('fails preview verification when HTML is blank or a fixture leaked', () => {
    const blank = verifyPreviewHttp({ statusCode: 200, body: '<html></html>', expectedProjectRef: 'proj_a' })
    assert.equal(blank.passed, false)
    const leak = verifyPreviewHttp({
      statusCode: 200,
      body: '<!DOCTYPE html><html><body><h1>Circuit Nest</h1><p>corev1-aug13 electronics</p></body></html>',
      expectedProjectRef: 'proj_masala',
      expectedBusinessName: 'Masala Store',
      forbiddenFixtures: ['Circuit Nest', 'corev1-aug13'],
    })
    assert.equal(leak.passed, false)
    assert.ok(leak.failures.some((f) => /fixture leak/i.test(f)))
  })

  it('does not re-classify a sealed masala spec from a Go Live utterance', () => {
    clearBusinessSpecsForTests()
    const created = inferBusinessSpec('create me a ecommerce site for a masala store')
    rememberBusinessSpec('proj_seal_masala', created)
    sealBusinessSpec('proj_seal_masala', 'turn_1')
    const afterLaunchChat = mergeBusinessSpec(rememberBusinessSpec('proj_seal_masala', created), {
      sourceIntent: 'Go Live — publish Circuit Nest electronics',
    })
    assert.equal(afterLaunchChat.catalog.verticalId, 'food-grocery')
    assert.equal(afterLaunchChat.sealed, true)
    assert.doesNotMatch(afterLaunchChat.catalog.verticalId, /electronics/)
  })
})
