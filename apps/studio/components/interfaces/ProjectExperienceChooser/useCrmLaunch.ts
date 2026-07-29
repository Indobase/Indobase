import { getAccessToken, useParams } from 'common'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import {
  CRM_ROLE_DENIED_CODE,
  isCrmRoleDeniedMessage,
} from 'lib/api/saas/crm-launch-shared'

type UseCrmLaunchOptions = {
  projectRef?: string
}

export type CrmLaunchResult =
  | { ok: true; url: string; crmTeamKey?: string; crmPipelineKey?: string; role?: string }
  | { ok: false; denied: true; message: string }
  | { ok: false; denied: false; message: string }

export function useCrmLaunch(options?: UseCrmLaunchOptions) {
  const params = useParams()
  const ref = options?.projectRef || params.ref
  const [isLaunching, setIsLaunching] = useState(false)

  const launch = useCallback(async (): Promise<CrmLaunchResult> => {
    if (!ref) {
      const message = 'Project ref is required to open CRM'
      toast.error(message)
      return { ok: false, denied: false, message }
    }

    setIsLaunching(true)
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) {
        throw new Error('You must be signed in to open CRM')
      }

      const response = await fetch(`/api/platform/projects/${ref}/crm/launch`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.url) {
        const message =
          (typeof payload?.message === 'string' && payload.message) ||
          `Failed to open CRM (${response.status})`
        if (
          response.status === 403 ||
          payload?.code === CRM_ROLE_DENIED_CODE ||
          isCrmRoleDeniedMessage(message)
        ) {
          setIsLaunching(false)
          return { ok: false, denied: true, message }
        }
        throw new Error(message)
      }

      setIsLaunching(false)
      return {
        ok: true,
        url: payload.url as string,
        crmTeamKey:
          typeof payload.crm_team_key === 'string' ? payload.crm_team_key : undefined,
        crmPipelineKey:
          typeof payload.crm_pipeline_key === 'string' ? payload.crm_pipeline_key : undefined,
        role: typeof payload.role === 'string' ? payload.role : undefined,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open CRM'
      toast.error(message)
      setIsLaunching(false)
      return { ok: false, denied: false, message }
    }
  }, [ref])

  return { isLaunching, launch, projectRef: ref }
}
