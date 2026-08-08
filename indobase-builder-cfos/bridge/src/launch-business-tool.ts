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

export { LAUNCH_AGENT_HARD_RULES, LAUNCH_BUSINESS_TOOL }

export type LaunchBusinessToolInput = {
  title?: string
  subdomain?: string
  customDomain?: string
  custom_domain?: string
  html?: string
  files?: Record<string, string>
}

export type LaunchBusinessToolResult = {
  ok: boolean
  status: StaticLaunchResult['status'] | 'rejected'
  url?: string
  preview_url?: string
  message: string
  lane: 'static'
  subdomain?: string
  custom_domain?: string
  dns?: StaticLaunchResult['dns']
  artifact_ref?: string
  /** Agent must only claim live when true */
  claim_live: boolean
  tool: 'launchBusiness'
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
  defaults?: { title?: string },
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

  const launchInput: StaticLaunchInput = {
    workspaceRef,
    title: typeof input.title === 'string' && input.title.trim() ? input.title : defaults?.title,
    subdomain: typeof input.subdomain === 'string' ? input.subdomain : undefined,
    customDomain: resolveCustomDomain(input),
    html: typeof input.html === 'string' ? input.html : undefined,
    files: input.files && typeof input.files === 'object' ? input.files : undefined,
  }

  const result = await launchStaticBusiness(launchInput)
  const claim = assertCanClaimLive({ ok: result.ok, url: result.url })

  return {
    ok: result.ok && claim.allowed,
    status: result.ok && !claim.allowed ? 'failed' : result.status,
    url: claim.allowed ? result.url : undefined,
    preview_url: result.previewUrl,
    message: claim.allowed
      ? result.message
      : claim.reason || result.message || 'Could not go live',
    lane: 'static',
    subdomain: result.subdomain,
    custom_domain: result.customDomain,
    dns: result.dns,
    artifact_ref: result.artifactRef,
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
