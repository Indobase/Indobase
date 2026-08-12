/**
 * Ecommerce release gate — Go Live FAIL → do not publish; PASS → ReleaseManifest.
 */

import {
  ECOMMERCE_APPLICATION_CONTRACT,
  ECOMMERCE_CONTRACT_VERSION,
  resolveApplicationContract,
  resolveContractAppType,
  type ApplicationContract,
} from './application-contract.js'
import {
  requiredFunctionalVerifiersFailed,
  runEcommerceFunctionalVerifiers,
  shouldRequireEcommerceFunctionalVerifiers,
} from './ecommerce-functional-verifiers.js'
import {
  requiredVerifiersFailed,
  runEcommerceStaticVerifiers,
  verifyCheckoutProbeLive,
  type VerifierResult,
} from './ecommerce-verifiers.js'
import { rememberReleaseManifest } from './release-manifest-store.js'

export type ReleaseManifest = {
  projectRef: string
  contractVersion: string
  applicationType: 'ecommerce'
  verifierResults: Array<{ id: string; ok: boolean; code?: string; severity: string }>
  url?: string
  timestamp: string
  /** Bridge GIT_SHA / BUILDER_CFOS_VERSION when set at publish time. */
  gitSha?: string
  deploy?: {
    lane?: string
    subdomain?: string
    artifact_ref?: string
  }
}

export type ReleaseFailureNode = {
  id: string
  code?: string
  severity: string
  expected?: string
  actual?: string
  repair_hint?: string
  file?: string
}

export type ReleaseGatePass = {
  ok: true
  applied: boolean
  contract: ApplicationContract | null
  results: VerifierResult[]
}

export type ReleaseGateFail = {
  ok: false
  applied: true
  code: 'contract_verifier_failed' | 'functional_verifier_failed'
  contract: ApplicationContract
  results: VerifierResult[]
  failures: VerifierResult[]
  failure_graph: ReleaseFailureNode[]
  message: string
  repair_hints: string[]
}

export type ReleaseGateResult = ReleaseGatePass | ReleaseGateFail

export type ReleaseGateInput = {
  projectRef?: string | null
  app_type?: string | null
  html?: string | null
  files?: Record<string, string> | null
  enableLiveProbe?: boolean
  commerceBaseUrl?: string | null
  pocketBasePublicUrl?: string | null
  enableFunctionalVerify?: boolean
  functionalRequireOverride?: boolean | null
  fetchFn?: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>
}

function formatFailureMessage(
  failures: VerifierResult[],
  kind: 'contract' | 'functional',
): string {
  const codes = failures.map((f) => f.code || f.id).join(', ')
  const hints = failures
    .map((f) => f.repair_hint)
    .filter((h): h is string => Boolean(h?.trim()))
  const hintBlock = hints.length ? ` Repair: ${hints.join(' ')}` : ''
  const label =
    kind === 'functional'
      ? 'functional verifiers'
      : `ApplicationContract (${ECOMMERCE_CONTRACT_VERSION})`
  return (
    `Ecommerce ${label} failed: ${codes}.` +
    ` Do not invent a live URL — fix per failure_graph repair_hint then call launchBusiness again.${hintBlock}`
  )
}

function toFailureGraph(failures: VerifierResult[]): ReleaseFailureNode[] {
  return failures.map((f) => ({
    id: f.id,
    code: f.code,
    severity: f.severity,
    expected: f.expected,
    actual: f.actual,
    repair_hint: f.repair_hint,
    file: f.file,
  }))
}

function failGate(
  contract: ApplicationContract,
  results: VerifierResult[],
  failures: VerifierResult[],
  kind: 'contract' | 'functional',
): ReleaseGateFail {
  return {
    ok: false,
    applied: true,
    code: kind === 'functional' ? 'functional_verifier_failed' : 'contract_verifier_failed',
    contract,
    results,
    failures,
    failure_graph: toFailureGraph(failures),
    message: formatFailureMessage(failures, kind),
    repair_hints: failures
      .map((f) => f.repair_hint)
      .filter((h): h is string => Boolean(h?.trim())),
  }
}

/**
 * Sync gate (static verifiers only) — preferred for unit tests and default Go Live
 * when functional pack is not required.
 */
export function assertEcommerceReleaseGate(input: ReleaseGateInput): ReleaseGateResult {
  const contract = resolveApplicationContract(input)
  if (!contract) {
    return { ok: true, applied: false, contract: null, results: [] }
  }

  const results = runEcommerceStaticVerifiers({
    html: input.html,
    files: input.files,
    projectRef: input.projectRef,
  })
  const failures = requiredVerifiersFailed(results)
  if (failures.length > 0) {
    return failGate(contract, results, failures, 'contract')
  }

  return { ok: true, applied: true, contract, results }
}

/**
 * Async gate: static (always required) + functional (policy-gated) + optional soft live probe.
 */
export async function assertEcommerceReleaseGateAsync(
  input: ReleaseGateInput,
): Promise<ReleaseGateResult> {
  const contract = resolveApplicationContract(input)
  if (!contract) {
    return { ok: true, applied: false, contract: null, results: [] }
  }

  const staticResults = runEcommerceStaticVerifiers({
    html: input.html,
    files: input.files,
    projectRef: input.projectRef,
  })
  const staticFailures = requiredVerifiersFailed(staticResults)
  if (staticFailures.length > 0) {
    return failGate(contract, staticResults, staticFailures, 'contract')
  }

  const functionalRequired = shouldRequireEcommerceFunctionalVerifiers({
    projectRef: input.projectRef,
    force: input.enableFunctionalVerify,
    requireOverride: input.functionalRequireOverride,
  })

  let functionalResults: VerifierResult[] = []
  if (functionalRequired || input.enableFunctionalVerify) {
    functionalResults = await runEcommerceFunctionalVerifiers({
      projectRef: input.projectRef || '',
      commerceBaseUrl: input.commerceBaseUrl,
      pocketBasePublicUrl: input.pocketBasePublicUrl,
      force: input.enableFunctionalVerify,
      requireOverride: input.functionalRequireOverride,
      fetchFn: input.fetchFn,
    })
    if (functionalRequired) {
      const functionalFailures = requiredFunctionalVerifiersFailed(functionalResults)
      if (functionalFailures.length > 0) {
        return failGate(
          contract,
          [...staticResults, ...functionalResults],
          functionalFailures,
          'functional',
        )
      }
    }
  } else {
    // Include skipped functional rows in manifest for observability.
    functionalResults = await runEcommerceFunctionalVerifiers({
      projectRef: input.projectRef || '',
      requireOverride: false,
    })
  }

  // Soft optional checkout probe (never required).
  const live = await verifyCheckoutProbeLive({
    commerceBaseUrl: input.commerceBaseUrl,
    projectRef: input.projectRef,
    enabled: input.enableLiveProbe,
  })

  const results = [...staticResults, ...functionalResults, live]
  return { ok: true, applied: true, contract, results }
}

export function buildReleaseManifest(input: {
  projectRef: string
  results: VerifierResult[]
  url?: string
  lane?: string
  subdomain?: string
  artifact_ref?: string
  contractVersion?: string
}): ReleaseManifest {
  const gitSha =
    (process.env.GIT_SHA || process.env.BUILDER_CFOS_VERSION || '').trim() || undefined
  const manifest: ReleaseManifest = {
    projectRef: input.projectRef,
    contractVersion: input.contractVersion || ECOMMERCE_CONTRACT_VERSION,
    applicationType: 'ecommerce',
    verifierResults: input.results.map((r) => ({
      id: r.id,
      ok: r.ok,
      code: r.code,
      severity: r.severity,
    })),
    url: input.url,
    timestamp: new Date().toISOString(),
    ...(gitSha ? { gitSha } : {}),
    deploy: {
      lane: input.lane,
      subdomain: input.subdomain,
      artifact_ref: input.artifact_ref,
    },
  }
  rememberReleaseManifest(manifest)
  return manifest
}

export function shouldRunEcommerceReleaseGate(input: {
  app_type?: string | null
  html?: string | null
  files?: Record<string, string> | null
}): boolean {
  return resolveContractAppType(input) === 'ecommerce'
}

export { ECOMMERCE_APPLICATION_CONTRACT, ECOMMERCE_CONTRACT_VERSION }
