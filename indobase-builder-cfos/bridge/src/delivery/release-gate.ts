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
  requiredVerifiersFailed,
  runEcommerceStaticVerifiers,
  runEcommerceVerifiers,
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
  code: 'contract_verifier_failed'
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
}

function formatFailureMessage(failures: VerifierResult[]): string {
  const codes = failures.map((f) => f.code || f.id).join(', ')
  const hints = failures
    .map((f) => f.repair_hint)
    .filter((h): h is string => Boolean(h?.trim()))
  const hintBlock = hints.length ? ` Repair: ${hints.join(' ')}` : ''
  return (
    `Ecommerce ApplicationContract (${ECOMMERCE_CONTRACT_VERSION}) failed verifiers: ${codes}.` +
    ` Do not invent a live URL — fix storefront / blueprint then call launchBusiness again.${hintBlock}`
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

/**
 * Sync gate (static verifiers only) — preferred for unit tests and default Go Live.
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
    return {
      ok: false,
      applied: true,
      code: 'contract_verifier_failed',
      contract,
      results,
      failures,
      failure_graph: toFailureGraph(failures),
      message: formatFailureMessage(failures),
      repair_hints: failures
        .map((f) => f.repair_hint)
        .filter((h): h is string => Boolean(h?.trim())),
    }
  }

  return { ok: true, applied: true, contract, results }
}

/**
 * Async gate including optional live probe (soft). Required failures still block.
 */
export async function assertEcommerceReleaseGateAsync(
  input: ReleaseGateInput,
): Promise<ReleaseGateResult> {
  const contract = resolveApplicationContract(input)
  if (!contract) {
    return { ok: true, applied: false, contract: null, results: [] }
  }

  const results = await runEcommerceVerifiers({
    html: input.html,
    files: input.files,
    projectRef: input.projectRef,
    enableLiveProbe: input.enableLiveProbe,
    commerceBaseUrl: input.commerceBaseUrl,
  })
  const failures = requiredVerifiersFailed(results)
  if (failures.length > 0) {
    return {
      ok: false,
      applied: true,
      code: 'contract_verifier_failed',
      contract,
      results,
      failures,
      failure_graph: toFailureGraph(failures),
      message: formatFailureMessage(failures),
      repair_hints: failures
        .map((f) => f.repair_hint)
        .filter((h): h is string => Boolean(h?.trim())),
    }
  }

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
