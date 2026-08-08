/**
 * OS business.launch — wires ExecutionPublisher + Plan/Ensure/Configure + Verify/Operator ports.
 * Customer verb: Launch Business / Go Live. Internally calls execution.publish.
 *
 * All launch ports are injected together here (not last-writer-wins from parallel streams).
 */
import {
  Platform,
  createBusinessLauncher,
  createExecutionPublisher,
  toOsLaunchResponse,
  type BusinessLaunchResult,
} from '@indobase/platform'

import type { Claims } from './platform'
import { createProvisionerDeploymentAdapter } from './provisioner-deployment-adapter'
import { createStudioPublishPreflight } from './os-publish-preflight'
import {
  createStudioBuildArtifactPort,
  createStudioCapabilityEnsurePort,
  createStudioFreezeSnapshotPort,
  createStudioMarkLivePort,
} from './os-publish-ports'
import { createStudioBusinessConfigurePort } from './os-business-configure'
import {
  createStudioBusinessEnsureCapabilitiesPort,
  createStudioBusinessPlannerPort,
} from './os-launch-planner'
import {
  createStudioBusinessOperatorPort,
  createStudioBusinessVerifyPort,
} from './os-business-operate-ports'

export async function launchOsBusiness({
  claims,
  workspaceRef,
  reason = 'os_launch',
  intent,
  requiredCapabilities,
  strictVerify,
  payload,
}: {
  claims: Claims
  workspaceRef: string
  reason?: string
  /** Optional Launch intent for capability auto-detect when requiredCapabilities omitted. */
  intent?: string
  requiredCapabilities?: string[]
  /** Override homepage hard gate; omit to resolve from os_publish.kind / env. */
  strictVerify?: boolean
  payload?: Record<string, unknown>
}): Promise<BusinessLaunchResult> {
  const executionPublisher = createExecutionPublisher({
    adapter: createProvisionerDeploymentAdapter(),
    preflight: createStudioPublishPreflight({ claims }),
    freezeSnapshot: createStudioFreezeSnapshotPort({ claims }),
    build: createStudioBuildArtifactPort({ claims }),
    capabilityEnsure: createStudioCapabilityEnsurePort({ claims }),
    markLive: createStudioMarkLivePort({ claims }),
    eventBus: Platform.events,
  })

  const launcher = createBusinessLauncher({
    executionPublisher,
    eventBus: Platform.events,
    planner: createStudioBusinessPlannerPort({ claims }),
    ensureCapabilities: createStudioBusinessEnsureCapabilitiesPort({ claims }),
    configure: createStudioBusinessConfigurePort({ claims }),
    verify: createStudioBusinessVerifyPort({ claims }),
    operator: createStudioBusinessOperatorPort({ claims }),
  })

  return launcher.launch({
    workspaceRef,
    reason,
    intent,
    requiredCapabilities,
    strictVerify,
    payload,
  })
}

/** Bridge-compatible OS API shape — status keeps `published` for live businesses. */
export async function launchOsBusinessForApi(input: {
  claims: Claims
  workspaceRef: string
  reason?: string
  intent?: string
  requiredCapabilities?: string[]
  strictVerify?: boolean
  payload?: Record<string, unknown>
}): Promise<{
  ok: boolean
  url?: string
  status: 'queued' | 'published' | 'failed'
  message?: string
}> {
  const result = await launchOsBusiness(input)
  return toOsLaunchResponse(result)
}
