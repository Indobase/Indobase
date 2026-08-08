import type { DeploymentAdapter, HealthProbe } from '@indobase/platform'

import { updateProjectDeployment } from './deployments'
import { ensureTenantSiteHosting } from './tenant-data-plane-provision'

const HEALTH_PROBE_TIMEOUT_MS = 5000

function isSuccessfulProbeStatus(status: number) {
  return (status >= 200 && status < 400) || status === 401
}

async function probeLiveUrl(liveUrl: string): Promise<HealthProbe> {
  const methods: Array<'HEAD' | 'GET'> = ['HEAD', 'GET']
  let lastError = 'request failed'

  for (const method of methods) {
    try {
      const signal =
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(HEALTH_PROBE_TIMEOUT_MS)
          : undefined
      const response = await fetch(liveUrl, {
        method,
        cache: 'no-store',
        redirect: 'follow',
        signal,
      })

      if (isSuccessfulProbeStatus(response.status)) {
        return {
          healthy: true,
          details: { method, status_code: response.status },
        }
      }

      lastError = `upstream responded ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'request failed'
    }
  }

  return {
    healthy: false,
    details: {
      message: "We couldn't confirm your site is live yet. Please try again in a moment.",
      error: lastError,
    },
  }
}

/**
 * Wraps provisioner ensure-site-hosting behind the execution.publish DeploymentAdapter port.
 * Rollback is best-effort: mark frozen deployment failed when possible (no provisioner unpublish).
 */
export function createProvisionerDeploymentAdapter(): DeploymentAdapter {
  return {
    prepare: async () => {},

    deploy: async (ctx) => {
      const ref = String(ctx.projectRef)
      await ensureTenantSiteHosting(ref)
      const artifactRef =
        typeof ctx.payload?.artifactRef === 'string' ? ctx.payload.artifactRef : ref
      return { artifactRef }
    },

    assignDomain: async (ctx, hostDomain) => {
      const ref = String(ctx.projectRef)
      const domain =
        hostDomain && hostDomain !== 'localhost' ? hostDomain : 'indobase.in'
      return { liveUrl: `https://${ref}.${domain}` }
    },

    provisionTLS: async () => {},

    healthCheck: async (_ctx, liveUrl) => probeLiveUrl(liveUrl),

    rollback: async (ctx, reason) => {
      const deploymentId =
        typeof ctx.payload?.deploymentId === 'string' ? ctx.payload.deploymentId : undefined
      if (!deploymentId) {
        // Gap: provisioner has no unpublish / site-route rollback API yet.
        return
      }

      try {
        // Do not force status→failed: ready deployments cannot transition to failed,
        // and site hosting cannot be unpublished via provisioner today.
        await updateProjectDeployment({
          deploymentId,
          ref: String(ctx.projectRef),
          source: 'runtime',
          lastError: reason.slice(0, 500),
          logMessage: 'Launch rolled back after publish failure',
          logLevel: 'error',
          metadataPatch: {
            os_publish_rollback: {
              at: new Date().toISOString(),
              reason: reason.slice(0, 500),
            },
          },
        })
      } catch {
        // Best-effort only.
      }
    },
  }
}
