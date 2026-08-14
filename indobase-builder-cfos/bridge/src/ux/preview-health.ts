/**
 * Server-side preview / production verification. Never iframe.contentDocument.
 */

import {
  productionVerificationPassed,
  runVerificationEngine,
  verificationPackForBusinessType,
  type VerificationResult,
} from '../../../../packages/platform/src/business/verification-engine.ts'
import { getWorkspaceRuntime } from './runtime-store.js'
import { readLiveFile } from '../static-launch.js'
import { getBusinessSpec } from './business-spec.js'
import { jsonRepositories } from './repositories/json-repositories.js'
import {
  passingEcommerceProbes,
  passingSaasProbes,
  probeEcommerceHttp,
  probeSaasHttp,
  type EcommerceProbeResult,
  type ProbeHttp,
  type SaasProbeResult,
} from './runtime-probes.js'

export type PreviewHealthReport = {
  status: 'ready' | 'failed' | 'not_ready'
  projectRef: string
  artifactHash: string | null
  applicationType: string | null
  html: boolean
  boot: boolean
  runtime: boolean
  commerce: boolean | null
  errors: string[]
  verification: VerificationResult | null
  productionPassed: boolean
}

export async function evaluatePreviewHealth(input: {
  projectRef: string
  httpStatus?: number | null
  html?: string | null
  purpose?: 'preview' | 'production' | 'smoke'
  probes?: ProbeHttp
  ecommerceProbes?: EcommerceProbeResult
  saasProbes?: SaasProbeResult
}): Promise<PreviewHealthReport> {
  const ref = (input.projectRef || '').trim()
  const purpose = input.purpose || 'preview'
  const runtime = getWorkspaceRuntime(ref)
  const spec = runtime?.spec || getBusinessSpec(ref)
  let html = input.html || runtime?.artifactHtml || ''
  if (!html) {
    const disk = await readLiveFile(ref, 'index.html')
    html = disk?.body.toString('utf8') || ''
  }
  if (!html) {
    return {
      status: 'not_ready',
      projectRef: ref,
      artifactHash: runtime?.preview.contentHash || null,
      applicationType: spec?.businessType || null,
      html: false,
      boot: false,
      runtime: false,
      commerce: spec?.businessType === 'ecommerce' ? false : null,
      errors: ['preview.html missing'],
      verification: null,
      productionPassed: false,
    }
  }
  const pack = verificationPackForBusinessType(spec?.businessType)
  let ecommerce = input.ecommerceProbes
  let saas = input.saasProbes
  if (purpose !== 'preview' && input.probes) {
    if (pack === 'ecommerce' && !ecommerce) ecommerce = await probeEcommerceHttp(ref, input.probes, html)
    if (pack === 'saas' && !saas) saas = await probeSaasHttp(ref, input.probes, html)
  }
  const verification = runVerificationEngine({
    pack,
    projectRef: ref,
    artifactHash: runtime?.preview.contentHash,
    expectedArtifactHash: runtime?.preview.contentHash,
    applicationType: spec?.businessType,
    httpStatus: input.httpStatus ?? 200,
    html,
    expectedBusinessName: spec?.businessName,
    commerceBound: pack === 'ecommerce' ? /indobase\.commerce|\/api\/os\/commerce/i.test(html) : false,
    catalogHttpOk: pack === 'ecommerce' ? ecommerce?.catalogHttpOk ?? null : null,
    productRendered: pack === 'ecommerce' ? ecommerce?.productRendered ?? null : null,
    cartOk: pack === 'ecommerce' ? ecommerce?.cartOk ?? null : null,
    checkoutOk: pack === 'ecommerce' ? ecommerce?.checkoutOk ?? null : null,
    orderOk: pack === 'ecommerce' ? ecommerce?.orderOk ?? null : null,
    orderVisible: pack === 'ecommerce' ? ecommerce?.orderVisible ?? null : null,
    authOk: pack === 'saas' ? saas?.authOk ?? null : null,
    workflowOk: pack === 'saas' ? saas?.workflowOk ?? null : null,
    persistenceOk: pack === 'saas' ? saas?.persistenceOk ?? null : null,
  })
  const productionPassed = productionVerificationPassed(verification)
  const boot = verification.checks.find((c) => c.id === 'boot')?.status === 'pass'
  const commerceCheck = verification.checks.find((c) => c.id === 'commerce.abi')
  jsonRepositories.verification.save({
    runId: `vr_${ref}_${Date.now()}`,
    projectRef: ref,
    artifactHash: verification.artifactHash || undefined,
    pack,
    purpose,
    passed: verification.passed,
    productionPassed,
    checks: verification.checks.map((c) => ({ id: c.id, status: c.status, message: c.message, evidence: c.evidence })),
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  })
  const gate = purpose === 'preview' ? verification.passed : productionPassed
  return {
    status: gate ? 'ready' : 'failed',
    projectRef: ref,
    artifactHash: verification.artifactHash,
    applicationType: spec?.businessType || null,
    html: true,
    boot,
    runtime: boot,
    commerce: pack === 'ecommerce' ? commerceCheck?.status === 'pass' : null,
    errors: gate ? [] : verification.failures.concat(productionPassed ? [] : ['required_probe_skip_or_fail']),
    verification,
    productionPassed,
  }
}

export { passingEcommerceProbes, passingSaasProbes }
