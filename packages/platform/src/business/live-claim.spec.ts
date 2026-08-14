import { describe, expect, it } from 'vitest'
import { assertCanClaimLive, liveClaimAllowsSpeech } from './live-claim'
import { artifactHashChainHolds, productionVerificationPassed, runVerificationEngine } from './verification-engine'

describe('LiveClaim', () => {
  it('refuses LIVE without smoke + matching artifact hashes', () => {
    const denied = assertCanClaimLive({
      projectRef: 'p1',
      verifiedArtifactId: 'art_a',
      verifiedArtifactHash: 'aaa',
      deployedArtifactId: 'art_a',
      deployedArtifactHash: 'bbb',
      liveUrl: 'https://p1.sites.indobase.in',
      liveHttpOk: true,
      smokeOk: true,
      deploymentId: 'job1',
      smokeTestId: 'smoke1',
    })
    expect(denied.ok).toBe(false)
    const ok = assertCanClaimLive({
      projectRef: 'p1',
      lifecycleState: 'live',
      verifiedArtifactId: 'art_a',
      verifiedArtifactHash: 'aaa',
      deployedArtifactId: 'art_a',
      deployedArtifactHash: 'aaa',
      liveUrl: 'https://p1.sites.indobase.in',
      liveHttpOk: true,
      smokeOk: true,
      deploymentId: 'job1',
      smokeTestId: 'smoke1',
    })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(liveClaimAllowsSpeech(ok.claim)).toBe(true)
  })
})

describe('capability probes', () => {
  it('fails ecommerce VERIFY when cart probe fails', () => {
    const html =
      '<!DOCTYPE html><html data-ib-project="p1"><body><h1>Masala</h1><p>long enough storefront body for html checks here</p><script>window.indobase={commerce:{}}</script></body></html>'
    const result = runVerificationEngine({
      pack: 'ecommerce',
      projectRef: 'p1',
      httpStatus: 200,
      html,
      commerceBound: true,
      cartOk: false,
    })
    expect(result.passed).toBe(false)
    expect(result.failures.some((f) => f.startsWith('commerce.cart'))).toBe(true)
  })

  it('does not treat checkout success as order visibility', () => {
    const html =
      '<!DOCTYPE html><html data-ib-project="p1" data-ib-boot="1"><body><h1>Masala Store</h1><p>long enough storefront body for html checks here</p><script>window.indobase={commerce:{}}</script></body></html>'
    const result = runVerificationEngine({
      pack: 'ecommerce',
      projectRef: 'p1',
      httpStatus: 200,
      html,
      commerceBound: true,
      catalogHttpOk: true,
      productRendered: true,
      cartOk: true,
      checkoutOk: true,
      orderOk: true,
      orderVisible: false,
    })
    expect(result.passed).toBe(false)
    expect(result.failures.some((f) => f.startsWith('commerce.order.visible'))).toBe(true)
    expect(productionVerificationPassed(result)).toBe(false)
  })

  it('does not let SKIP of a required ecommerce probe pass the production gate', () => {
    const html =
      '<!DOCTYPE html><html data-ib-project="p1" data-ib-boot="1"><body><h1>Masala Store</h1><p>long enough storefront body for html checks here</p><script>window.indobase={commerce:{}}</script></body></html>'
    const result = runVerificationEngine({
      pack: 'ecommerce',
      projectRef: 'p1',
      httpStatus: 200,
      html,
      commerceBound: true,
    })
    expect(result.passed).toBe(true)
    expect(productionVerificationPassed(result)).toBe(false)
    expect(result.productionPassed).toBe(false)
  })

  it('requires verified === deployed === live hashes', () => {
    expect(artifactHashChainHolds({ verifiedArtifactHash: 'a', deployedArtifactHash: 'a', liveArtifactHash: 'a' })).toBe(true)
    expect(artifactHashChainHolds({ verifiedArtifactHash: 'a', deployedArtifactHash: 'a', liveArtifactHash: 'b' })).toBe(false)
  })
})
