/**
 * Launch capability planner — Studio I/O + business.launch ports.
 * Heuristics live in os-launch-planner-core (deterministic, no LLM).
 */
import type {
  BusinessEnsureCapabilitiesPort,
  BusinessPlannerPort,
} from '@indobase/platform'

import { listProjectDeployments } from './deployments'
import {
  planLaunchCapabilities,
  type LaunchPlannerResult,
  type LaunchPlannerSignals,
} from './os-launch-planner-core'
import { createStudioCapabilityEnsurePort } from './os-publish-ports'
import { getOsWorkspace } from './os-workspace'
import { getGotrueUserId, type Claims } from './platform'
import { executeQuery } from './query'

export {
  collectDeclaredCapabilities,
  planLaunchCapabilities,
  buildLaunchScanCorpus,
  LAUNCH_CAPABILITY_IDS,
  type LaunchCapabilityId,
  type LaunchPlannerResult,
  type LaunchPlannerSignals,
} from './os-launch-planner-core'

/** Port shape for packages/platform business.launch consumers. */
export interface LaunchCapabilityPlannerPort {
  plan(input: {
    projectRef: string
    intent?: string
    payload?: Record<string, unknown>
  }): Promise<LaunchPlannerResult>
}

async function loadWorkspaceAuthConfig({
  claims,
  workspaceRef,
}: {
  claims: Claims
  workspaceRef: string
}): Promise<unknown> {
  const gotrueId = getGotrueUserId(claims)
  const rows = await executeQuery<{ auth_config: unknown }>({
    query: `
      select p.auth_config
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2 and p.is_branch = false
      limit 1
    `,
    parameters: [workspaceRef, gotrueId],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  return rows.data?.[0]?.auth_config ?? null
}

/**
 * Load workspace + deployment signals and plan Launch capabilities.
 */
export async function planOsLaunchCapabilities({
  claims,
  workspaceRef,
  intent,
  payload,
}: {
  claims: Claims
  workspaceRef: string
  intent?: string
  payload?: Record<string, unknown>
}): Promise<LaunchPlannerResult> {
  const workspace = await getOsWorkspace({ claims, ref: workspaceRef })
  if (!workspace) {
    return {
      requiredCapabilities: [],
      reasons: {},
      readinessNotes: ['Workspace not found — Launch cannot detect features yet.'],
    }
  }

  let authConfig: unknown = null
  try {
    authConfig = await loadWorkspaceAuthConfig({ claims, workspaceRef })
  } catch {
    authConfig = null
  }

  let deployments: LaunchPlannerSignals['deployments'] = []
  try {
    const rows = await listProjectDeployments({ claims, ref: workspaceRef, limit: 10 })
    deployments = rows.map((d) => ({ metadata: d.metadata, status: d.status }))
  } catch {
    deployments = []
  }

  const intentFromPayload =
    typeof payload?.intent === 'string'
      ? payload.intent
      : typeof payload?.launch_intent === 'string'
        ? payload.launch_intent
        : typeof payload?.reason === 'string' && payload.reason !== 'os_launch'
          ? payload.reason
          : undefined

  return planLaunchCapabilities({
    intent: intent ?? intentFromPayload,
    payload,
    authConfig,
    deployments,
    provisionState: workspace.provision_state,
    workspaceName: workspace.name,
  })
}

export function createStudioLaunchCapabilityPlannerPort({
  claims,
}: {
  claims: Claims
}): LaunchCapabilityPlannerPort {
  return {
    async plan({ projectRef, intent, payload }) {
      return planOsLaunchCapabilities({
        claims,
        workspaceRef: projectRef,
        intent,
        payload,
      })
    },
  }
}

/**
 * business.launch Plan port — auto-detects requiredCapabilities when omitted.
 * Explicit lists (including empty hosting-only) are preserved.
 */
export function createStudioBusinessPlannerPort({
  claims,
}: {
  claims: Claims
}): BusinessPlannerPort {
  return {
    async plan(input) {
      if (Array.isArray(input.requiredCapabilities)) {
        const caps = input.requiredCapabilities.filter(
          (c): c is string => typeof c === 'string' && c.trim().length > 0,
        )
        return {
          ok: true,
          plan: {
            requiredCapabilities: caps,
            reasons: {},
            readinessNotes:
              caps.length === 0
                ? ['Hosting only — no backend features requested.']
                : [`Using requested features: ${caps.join(', ')}.`],
            source: 'explicit',
          },
        }
      }

      try {
        const planned = await planOsLaunchCapabilities({
          claims,
          workspaceRef: input.workspaceRef,
          intent: input.intent,
          payload: input.payload,
        })
        return {
          ok: true,
          plan: {
            requiredCapabilities: planned.requiredCapabilities,
            reasons: planned.reasons,
            readinessNotes: planned.readinessNotes,
            source: 'auto',
          },
        }
      } catch {
        return {
          ok: false,
          message: 'We could not prepare your business launch yet. Please try again.',
        }
      }
    },
  }
}

/**
 * business.launch EnsureCapabilities — wraps ensureOsCapability via PublishPorts
 * (createStudioCapabilityEnsurePort → ensureOsCapability; no duplicate provisioner).
 */
export function createStudioBusinessEnsureCapabilitiesPort({
  claims,
}: {
  claims: Claims
}): BusinessEnsureCapabilitiesPort {
  const ensurePort = createStudioCapabilityEnsurePort({ claims })
  return {
    async ensureCapabilities({ workspaceRef, capabilities, payload }) {
      const result = await ensurePort.ensureCapabilities({
        projectRef: workspaceRef,
        capabilities,
        payload,
      })
      if (!result.ok) {
        return {
          ok: false,
          capability: result.capability,
          message: result.message,
        }
      }
      return { ok: true }
    },
  }
}

/**
 * Resolve capabilities for publish: explicit list wins; omitted → auto-detect.
 * Explicit empty array stays empty (hosting-only Launch).
 */
export async function resolvePublishRequiredCapabilities({
  claims,
  workspaceRef,
  requiredCapabilities,
  intent,
  payload,
}: {
  claims: Claims
  workspaceRef: string
  requiredCapabilities?: string[]
  intent?: string
  payload?: Record<string, unknown>
}): Promise<{
  requiredCapabilities: string[]
  planner?: LaunchPlannerResult
}> {
  if (Array.isArray(requiredCapabilities)) {
    return { requiredCapabilities }
  }

  const planner = await planOsLaunchCapabilities({
    claims,
    workspaceRef,
    intent,
    payload,
  })

  return {
    requiredCapabilities: planner.requiredCapabilities,
    planner,
  }
}
