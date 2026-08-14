import { describe, expect, it } from 'vitest'
import { runVerificationEngine } from './verification-engine'
import { hashArtifactFiles, sameArtifact, hostReuseRejected } from './artifact'

describe('VerificationEngine', () => {
  it('fails when HTML is blank even if HTTP is 200', () => {
    const result = runVerificationEngine({
      pack: 'ecommerce',
      projectRef: 'proj_a',
      httpStatus: 200,
      html: 'ok',
    })
    expect(result.passed).toBe(false)
    expect(result.failures.some((f) => f.startsWith('html'))).toBe(true)
  })

  it('does not require commerce for landing', () => {
    const html =
      '<!DOCTYPE html><html data-ib-project="proj_r" data-ib-boot="1"><body><h1>Robotics</h1><p>Hello from a long enough landing page body for verification.</p></body></html>'
    const result = runVerificationEngine({
      pack: 'landing',
      projectRef: 'proj_r',
      httpStatus: 200,
      html,
      expectedBusinessName: 'Robotics',
    })
    expect(result.checks.find((c) => c.id === 'commerce.abi')?.status).toBe('skip')
    expect(result.passed).toBe(true)
    expect(result.productionPassed).toBe(true)
  })

  it('rejects Circuit Nest fixture leak on a masala artifact', () => {
    const html =
      '<!DOCTYPE html><html data-ib-project="proj_m"><body><h1>Circuit Nest</h1><p>electronics storefront body content here</p></body></html>'
    const result = runVerificationEngine({
      pack: 'ecommerce',
      projectRef: 'proj_m',
      httpStatus: 200,
      html,
      expectedBusinessName: 'Masala Store',
    })
    expect(result.passed).toBe(false)
    expect(result.failures.some((f) => /fixtures/i.test(f))).toBe(true)
  })

  it('treats distinct file sets as distinct artifact hashes', () => {
    const a = hashArtifactFiles({ 'index.html': '<h1>A</h1>' })
    const b = hashArtifactFiles({ 'index.html': '<h1>B</h1>' })
    expect(sameArtifact({ artifactHash: a }, { artifactHash: b })).toBe(false)
  })

  it('rejects attaching a foreign host to a new project', () => {
    expect(hostReuseRejected('corev1-aug13.sites.indobase.in', 'old_proj', 'roshabc123')).toBe(true)
    expect(hostReuseRejected('roshabc123.sites.indobase.in', 'roshabc123', 'roshabc123')).toBe(false)
  })
})
