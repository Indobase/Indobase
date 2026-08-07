/**
 * OS agent usage → Builder prompt quota (saas.organizations.builder_prompts_used).
 * Thin wrapper so CFOS / bridge can check and consume without Builder MCP tokens.
 */
import {
  consumeBuilderPrompt,
  getBuilderPromptQuota,
  type BuilderPromptQuota,
} from './builder-prompt-quota'
import { getOsWorkspace } from './os-workspace'
import type { Claims } from './platform'

export type OsPromptQuotaResult = BuilderPromptQuota & {
  organization_slug: string
  upgradeUrl: string
}

function upgradeUrlFor(orgSlug: string): string {
  return `/org/${encodeURIComponent(orgSlug)}/billing?panel=subscriptionPlan`
}

export async function getOsPromptQuota({
  claims,
  workspaceRef,
}: {
  claims: Claims
  workspaceRef: string
}): Promise<OsPromptQuotaResult | null> {
  const workspace = await getOsWorkspace({ claims, ref: workspaceRef })
  if (!workspace) return null
  const quota = await getBuilderPromptQuota(workspace.organization_slug)
  if (!quota) return null
  return {
    ...quota,
    organization_slug: workspace.organization_slug,
    upgradeUrl: upgradeUrlFor(workspace.organization_slug),
  }
}

export async function consumeOsPromptQuota({
  claims,
  workspaceRef,
}: {
  claims: Claims
  workspaceRef: string
}): Promise<
  | { ok: true; quota: OsPromptQuotaResult }
  | { ok: false; quota: OsPromptQuotaResult; message: string }
  | { ok: false; notFound: true }
> {
  const workspace = await getOsWorkspace({ claims, ref: workspaceRef })
  if (!workspace) return { ok: false, notFound: true }

  const orgSlug = workspace.organization_slug
  const result = await consumeBuilderPrompt(orgSlug)

  const quota: OsPromptQuotaResult = {
    ...result.quota,
    organization_slug: orgSlug,
    upgradeUrl: result.ok ? upgradeUrlFor(orgSlug) : result.upgradeUrl,
  }

  if (!result.ok) {
    return {
      ok: false,
      quota,
      message: 'Free agent limit reached (5 prompts). Upgrade your plan to continue.',
    }
  }

  return { ok: true, quota }
}
