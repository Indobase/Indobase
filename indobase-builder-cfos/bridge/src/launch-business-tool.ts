/**
 * Agent-facing launchBusiness / goLive tool — wraps Static Launch (+ optional app-host).
 * Same-origin only; never invents URLs; never third-party hosts.
 */

import {
  LAUNCH_AGENT_HARD_RULES,
  LAUNCH_BUSINESS_TOOL,
  assertCanClaimLive,
  assertLaunchHasContent,
} from '@indobase/cloudflare-adapter'

import {
  launchStaticBusiness,
  type StaticLaunchInput,
  type StaticLaunchResult,
} from './static-launch.js'
import { platformDeployPublish, resolvePlatformApiUrl } from './platform-api-client.js'
import { isManagedBackendConfigured } from './pocketbase/managed.js'
import { assertLaunchArchitectureReady, resolveEffectiveAppType } from './launch-backend-gate.js'
import { autoWireLaunchArtifacts } from './wire-proof.js'
import { publishToAppHost, resolveAppHostProvisioner } from './app-host-publish.js'
import type { BackendConfig } from './auth.js'
import { getBusinessSpec, inferBusinessSpec } from './ux/business-spec.js'
import { ensureEcommerceStorefrontFiles, ensureLandingAppFiles, ensureSaasAppFiles } from './ux/preview-artifact.js'
import { rememberLivePublishJob } from './production-launch/job-store.js'
import {
  applyLaunchGateToTaskGraph,
  assertEcommerceReleaseGateAsync,
  buildEcommerceTaskGraph,
  buildReleaseManifest,
  summarizeTaskGraph,
  type EcommerceTaskGraph,
  type EcommerceTaskGraphSummary,
  type ReleaseFailureNode,
  type ReleaseManifest,
  type VerifierResult,
} from './delivery/index.js'

export { LAUNCH_AGENT_HARD_RULES, LAUNCH_BUSINESS_TOOL }

export type LaunchBusinessToolInput = {
  title?: string
  subdomain?: string
  customDomain?: string
  custom_domain?: string
  html?: string
  files?: Record<string, string>
  /** When set, also mirrors artifacts to Studio hosting (Builder-compatible path). */
  gotrueId?: string
  email?: string
  /** Explicit app type — saas/booking/dashboard/ecommerce/blog require session backend before Go Live. */
  app_type?: string | null
  require_backend?: boolean | null
}

export type LaunchBusinessToolResult = {
  ok: boolean
  status: StaticLaunchResult['status'] | 'rejected' | 'queued' | 'published' | 'failed'
  url?: string
  preview_url?: string
  message: string
  lane: 'static' | 'platform' | 'static+platform' | 'app-host' | 'static+app-host'
  subdomain?: string
  custom_domain?: string
  dns?: StaticLaunchResult['dns']
  artifact_ref?: string
  platform_url?: string
  /** Agent must only claim live when true */
  claim_live: boolean
  tool: 'launchBusiness'
  code?: string
  /** Ecommerce ApplicationContract verifier pack results (when gate applied). */
  verifier_results?: VerifierResult[]
  failure_graph?: ReleaseFailureNode[]
  repair_hints?: string[]
  /** Present after successful ecommerce Go Live. */
  release_manifest?: ReleaseManifest
  contract_version?: string
  /** Ecommerce task graph progress (gate / publish / manifest). */
  task_graph?: EcommerceTaskGraph
  task_graph_summary?: EcommerceTaskGraphSummary
}

function resolveCustomDomain(input: LaunchBusinessToolInput): string | undefined {
  if (typeof input.customDomain === 'string' && input.customDomain.trim()) {
    return input.customDomain.trim()
  }
  if (typeof input.custom_domain === 'string' && input.custom_domain.trim()) {
    return input.custom_domain.trim()
  }
  return undefined
}

/**
 * Execute the hard-path Go Live tool. Requires real html/files.
 * claim_live is true only when API returns ok + a non-forbidden url.
 */
export async function executeLaunchBusinessTool(
  workspaceRef: string,
  input: LaunchBusinessToolInput,
  defaults?: { title?: string; backend?: BackendConfig | null },
): Promise<LaunchBusinessToolResult> {
  const content = assertLaunchHasContent(input)
  if (!content.ok) {
    return {
      ok: false,
      status: 'rejected',
      message: content.message || 'html or files required',
      lane: 'static',
      claim_live: false,
      tool: 'launchBusiness',
    }
  }

  // Resolve app type from agent input / original content BEFORE autoWire.
  // Env inject can add ANON_KEY markers that would falsely reclassify landing → saas.
  const effectiveAppType =
    (typeof input.app_type === 'string' && input.app_type.trim()
      ? input.app_type.trim()
      : null) ||
    resolveEffectiveAppType({
      app_type: input.app_type,
      require_backend: input.require_backend,
      html: typeof input.html === 'string' ? input.html : undefined,
      files: input.files,
    })

  // Auto-wire / replace localStorage storefront BEFORE backend gate (env inject alone is not enough).
  let launchHtml = typeof input.html === 'string' ? input.html : undefined
  let launchFiles = input.files && typeof input.files === 'object' ? { ...input.files } : undefined
  const spec = getBusinessSpec(workspaceRef) || inferBusinessSpec(input.title || '')
  if (
    spec.businessType === 'ecommerce' ||
    effectiveAppType === 'ecommerce' ||
    input.app_type === 'ecommerce' ||
    input.app_type === 'shop' ||
    input.app_type === 'store'
  ) {
    const built = ensureEcommerceStorefrontFiles({
      spec: { ...spec, businessType: 'ecommerce' },
      projectRef: workspaceRef,
      html: launchHtml,
      files: launchFiles,
    })
    launchHtml = built.html
    launchFiles = built.files
  } else if (
    spec.businessType === 'saas' ||
    effectiveAppType === 'saas' ||
    input.app_type === 'saas' ||
    input.app_type === 'app'
  ) {
    const built = ensureSaasAppFiles({
      spec: { ...spec, businessType: 'saas' },
      projectRef: workspaceRef,
      html: launchHtml,
      files: launchFiles,
      backend: defaults?.backend,
    })
    launchHtml = built.html
    launchFiles = built.files
  } else if (
    spec.businessType === 'landing' ||
    effectiveAppType === 'landing' ||
    input.app_type === 'landing' ||
    input.app_type === 'website'
  ) {
    const built = ensureLandingAppFiles({
      spec: { ...spec, businessType: 'landing' },
      html: launchHtml,
      files: launchFiles,
    })
    launchHtml = built.html
    launchFiles = built.files
  }
  if (
    defaults?.backend &&
    spec.businessType !== 'landing' &&
    effectiveAppType !== 'landing' &&
    input.app_type !== 'landing' &&
    input.app_type !== 'website'
  ) {
    const wired = autoWireLaunchArtifacts({
      html: launchHtml,
      files: launchFiles,
      backend: defaults.backend,
      brand: typeof input.title === 'string' ? input.title : defaults.title,
      replaceUnwiredStorefront: false,
    })
    launchHtml = wired.html
    launchFiles = wired.files
  }

  const backendGate = await assertLaunchArchitectureReady(defaults?.backend, {
    app_type: effectiveAppType,
    require_backend: input.require_backend,
    projectRef: workspaceRef,
    html: launchHtml,
    files: launchFiles,
  })
  if (!backendGate.ok) {
    return {
      ok: false,
      status: 'rejected',
      message: backendGate.message,
      lane: 'static',
      claim_live: false,
      tool: 'launchBusiness',
      code: backendGate.code,
    }
  }

  // Ecommerce ApplicationContract release gate — FAIL blocks publish (machine-owned DoD).
  const releaseGate = await assertEcommerceReleaseGateAsync({
    projectRef: workspaceRef,
    app_type: effectiveAppType,
    html: launchHtml,
    files: launchFiles,
  })
  if (!releaseGate.ok) {
    const failedGraph = applyLaunchGateToTaskGraph(buildEcommerceTaskGraph(), {
      gateApplied: true,
      gateOk: false,
      published: false,
      manifestOk: false,
      failure_graph: releaseGate.failure_graph,
      message: releaseGate.message,
    })
    return {
      ok: false,
      status: 'rejected',
      message: releaseGate.message,
      lane: 'static',
      claim_live: false,
      tool: 'launchBusiness',
      code: releaseGate.code,
      verifier_results: releaseGate.results,
      failure_graph: releaseGate.failure_graph,
      repair_hints: releaseGate.repair_hints,
      contract_version: releaseGate.contract.version,
      task_graph: failedGraph,
      task_graph_summary: summarizeTaskGraph(failedGraph),
    }
  }

  const launchInput: StaticLaunchInput = {
    workspaceRef,
    title: typeof input.title === 'string' && input.title.trim() ? input.title : defaults?.title,
    subdomain: typeof input.subdomain === 'string' ? input.subdomain : undefined,
    customDomain: resolveCustomDomain(input),
    html: launchHtml,
    files: launchFiles,
  }

  const result = await launchStaticBusiness(launchInput)
  const claim = assertCanClaimLive({ ok: result.ok, url: result.url })

  // App-host container publish when configured (pivot Phase A).
  let appHostUrl: string | undefined
  if (claim.allowed && resolveAppHostProvisioner()) {
    const hosted = await publishToAppHost({
      workspaceRef,
      subdomain: launchInput.subdomain || result.subdomain,
      title: launchInput.title,
      files: launchInput.files,
      html: launchInput.html,
    })
    if (hosted.ok) appHostUrl = hosted.url
  }

  // Mirror to Studio only when managed backend is NOT the primary path (Studio may be scaled down).
  let platformUrl: string | undefined
  let platformMirrored = false
  if (
    claim.allowed &&
    !isManagedBackendConfigured() &&
    resolvePlatformApiUrl() &&
    input.gotrueId?.trim() &&
    typeof input.email === 'string'
  ) {
    const files =
      launchInput.files ||
      (launchInput.html ? { 'index.html': launchInput.html } : undefined)
    try {
      const mirrored = await platformDeployPublish({
        gotrueId: input.gotrueId.trim(),
        email: input.email,
        workspaceRef,
        reason: 'launchBusiness',
        files,
        html: launchInput.html,
        title: launchInput.title,
        subdomain: launchInput.subdomain,
        customDomain: launchInput.customDomain,
        intent: 'go_live',
      })
      if (mirrored.ok && typeof mirrored.url === 'string' && mirrored.url.startsWith('http')) {
        platformUrl = mirrored.url
        platformMirrored = true
      }
    } catch {
      // Static URL remains authoritative if platform mirror fails.
    }
  }

  const liveUrl = claim.allowed ? appHostUrl || result.url : undefined
  let message = !claim.allowed
    ? claim.reason || result.message || 'Could not go live'
    : result.message
  if (claim.allowed && appHostUrl && appHostUrl !== result.url) {
    message = `${message} App host: ${appHostUrl}`
  }
  if (claim.allowed && platformMirrored && platformUrl) {
    message = `${message} Also synced to Studio hosting: ${platformUrl}`
  }

  const lane: LaunchBusinessToolResult['lane'] = appHostUrl
    ? result.ok
      ? 'static+app-host'
      : 'app-host'
    : platformMirrored
      ? 'static+platform'
      : 'static'

  const claimLive = result.ok && claim.allowed
  let releaseManifest: ReleaseManifest | undefined
  if (claimLive && releaseGate.applied && releaseGate.contract) {
    releaseManifest = buildReleaseManifest({
      projectRef: workspaceRef,
      results: releaseGate.results,
      url: liveUrl,
      lane,
      subdomain: result.subdomain,
      artifact_ref: result.artifactRef,
      contractVersion: releaseGate.contract.version,
    })
  }

  let taskGraph: EcommerceTaskGraph | undefined
  let taskGraphSummary: EcommerceTaskGraphSummary | undefined
  if (releaseGate.applied) {
    taskGraph = applyLaunchGateToTaskGraph(buildEcommerceTaskGraph(), {
      gateApplied: true,
      gateOk: true,
      published: claimLive,
      manifestOk: Boolean(releaseManifest),
      message: claimLive ? 'Release gate passed' : message,
    })
    taskGraphSummary = summarizeTaskGraph(taskGraph)
  }

  if (claimLive && liveUrl) {
    rememberLivePublishJob({
      projectRef: workspaceRef,
      url: liveUrl,
      gotrueId: input.gotrueId,
      email: input.email,
      html: launchHtml,
      files: launchFiles,
      title: launchInput.title,
      intent: spec.sourceIntent || input.title,
      appType: spec.businessType === 'ecommerce' ? 'ecommerce' : effectiveAppType,
    })
  }

  return {
    ok: claimLive,
    status: result.ok && !claim.allowed ? 'failed' : result.status,
    url: liveUrl,
    preview_url: result.previewUrl,
    message,
    lane,
    subdomain: result.subdomain,
    custom_domain: result.customDomain,
    dns: result.dns,
    artifact_ref: result.artifactRef,
    platform_url: platformUrl || appHostUrl,
    claim_live: claim.allowed,
    tool: 'launchBusiness',
    verifier_results: releaseGate.applied ? releaseGate.results : undefined,
    release_manifest: releaseManifest,
    contract_version: releaseGate.contract?.version,
    task_graph: taskGraph,
    task_graph_summary: taskGraphSummary,
  }
}

/** Session catalog entry so agents discover the tool. */
export function launchBusinessToolCatalog() {
  return {
    name: LAUNCH_BUSINESS_TOOL.name,
    aliases: [...LAUNCH_BUSINESS_TOOL.aliases],
    description: LAUNCH_BUSINESS_TOOL.description,
    method: LAUNCH_BUSINESS_TOOL.method,
    path: LAUNCH_BUSINESS_TOOL.path,
    alias_path: LAUNCH_BUSINESS_TOOL.aliasPath,
    wraps: LAUNCH_BUSINESS_TOOL.wraps,
    parameters: LAUNCH_BUSINESS_TOOL.parameters,
    rules: LAUNCH_AGENT_HARD_RULES,
  }
}
