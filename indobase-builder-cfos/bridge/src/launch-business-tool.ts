/**
 * Agent-facing launchBusiness / goLive tool — wraps Static Launch.
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
import { assertLaunchArchitectureReady } from './launch-backend-gate.js'
import { injectIndobaseEnvIntoLaunchContent } from './publish-env-inject.js'
import type { BackendConfig } from './auth.js'

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
  lane: 'static' | 'platform' | 'static+platform'
  subdomain?: string
  custom_domain?: string
  dns?: StaticLaunchResult['dns']
  artifact_ref?: string
  platform_url?: string
  /** Agent must only claim live when true */
  claim_live: boolean
  tool: 'launchBusiness'
  code?: string
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
  const backendGate = await assertLaunchArchitectureReady(defaults?.backend, {
    app_type: input.app_type,
    require_backend: input.require_backend,
    projectRef: workspaceRef,
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

  const injected = injectIndobaseEnvIntoLaunchContent({
    html: typeof input.html === 'string' ? input.html : undefined,
    files: input.files && typeof input.files === 'object' ? input.files : undefined,
    backend: defaults?.backend ?? undefined,
  })

  const launchInput: StaticLaunchInput = {
    workspaceRef,
    title: typeof input.title === 'string' && input.title.trim() ? input.title : defaults?.title,
    subdomain: typeof input.subdomain === 'string' ? input.subdomain : undefined,
    customDomain: resolveCustomDomain(input),
    html: injected.html ?? (typeof input.html === 'string' ? input.html : undefined),
    files: injected.files ?? (input.files && typeof input.files === 'object' ? input.files : undefined),
  }

  const result = await launchStaticBusiness(launchInput)
  const claim = assertCanClaimLive({ ok: result.ok, url: result.url })

  // Mirror artifacts to Studio hosting when Platform API is configured (unifies with Builder publish).
  let platformUrl: string | undefined
  let platformMirrored = false
  if (
    claim.allowed &&
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

  const liveUrl = claim.allowed ? result.url : undefined
  const message = !claim.allowed
    ? claim.reason || result.message || 'Could not go live'
    : platformMirrored && platformUrl && platformUrl !== liveUrl
      ? `${result.message} Also synced to Studio hosting: ${platformUrl}`
      : platformMirrored
        ? `${result.message} (synced to Studio hosting)`
        : result.message

  return {
    ok: result.ok && claim.allowed,
    status: result.ok && !claim.allowed ? 'failed' : result.status,
    url: liveUrl,
    preview_url: result.previewUrl,
    message,
    lane: platformMirrored ? 'static+platform' : 'static',
    subdomain: result.subdomain,
    custom_domain: result.customDomain,
    dns: result.dns,
    artifact_ref: result.artifactRef,
    platform_url: platformUrl,
    claim_live: claim.allowed,
    tool: 'launchBusiness',
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
