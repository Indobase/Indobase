/**
 * OS deploy — thin wrapper: publishOsWorkspace → business.launch → execution.publish.
 */
import { launchOsBusinessForApi } from './os-business-launch'
import type { Claims } from './platform'

export async function publishOsWorkspace({
  claims,
  workspaceRef,
  reason = 'os_launch',
  intent,
  requiredCapabilities,
  payload,
}: {
  claims: Claims
  workspaceRef: string
  reason?: string
  /** Optional Launch intent for capability auto-detect. */
  intent?: string
  /** Omit → planner auto-detects. Explicit `[]` = hosting-only. */
  requiredCapabilities?: string[]
  payload?: Record<string, unknown>
}): Promise<{
  ok: boolean
  url?: string
  status: 'queued' | 'published' | 'failed'
  message?: string
}> {
  return launchOsBusinessForApi({
    claims,
    workspaceRef,
    reason,
    intent,
    requiredCapabilities,
    payload,
  })
}
