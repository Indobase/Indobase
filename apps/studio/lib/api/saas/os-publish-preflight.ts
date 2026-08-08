import type { PublishPreflightPort, PublishPreflightResult } from '@indobase/platform'

import { getOsWorkspace } from './os-workspace'
import type { Claims } from './platform'
import {
  isDataPlaneProvisionerConfigured,
} from './tenant-data-plane-provision'
import { resolvePublicDomainForTenantStack } from './tenant-public-urls'

function resolveHostDomain(): string {
  const domain = resolvePublicDomainForTenantStack()
  return domain && domain !== 'localhost' ? domain : 'indobase.in'
}

export function createStudioPublishPreflight({
  claims,
}: {
  claims: Claims
}): PublishPreflightPort {
  return {
    async validateWorkspace(input): Promise<PublishPreflightResult> {
      const workspace = await getOsWorkspace({ claims, ref: input.projectRef })
      if (!workspace) {
        return { ok: false, message: 'Workspace not found' }
      }

      const hostDomain = resolveHostDomain()
      const provisionerConfigured = isDataPlaneProvisionerConfigured()
      const deployReady =
        workspace.provision_state !== 'none' && provisionerConfigured

      let queuedMessage: string | undefined
      if (!deployReady) {
        if (workspace.provision_state === 'none') {
          queuedMessage =
            'Launch queued — publish URL reserved. Add login or deploy artifacts when your site is ready.'
        } else if (!provisionerConfigured) {
          queuedMessage =
            'Launch queued — hosting adapter not configured in this environment.'
        }
      }

      return {
        ok: true,
        projectRef: input.projectRef,
        provisionState: workspace.provision_state,
        hostDomain,
        provisionerConfigured,
        deployReady,
        queuedMessage,
      }
    },
  }
}
