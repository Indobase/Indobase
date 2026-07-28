import { getAccessToken, useParams } from 'common'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import {
  isSuiteRoleDeniedMessage,
  SUITE_ROLE_DENIED_CODE,
  type SuiteModuleId,
} from 'lib/api/saas/suite-launch-shared'

type UseSuiteLaunchOptions = {
  projectRef?: string
}

export type SuiteLaunchResult =
  | {
      ok: true
      url: string
      suiteTeamKey?: string
      suiteProjectKey?: string
      role?: string
      externalProduct?: 'email'
    }
  | { ok: false; denied: true; message: string }
  | { ok: false; denied: false; message: string }

export function useSuiteLaunch(options?: UseSuiteLaunchOptions) {
  const params = useParams()
  const ref = options?.projectRef || params.ref
  const [isLaunching, setIsLaunching] = useState(false)

  const launch = useCallback(
    async (module?: SuiteModuleId): Promise<SuiteLaunchResult> => {
      if (!ref) {
        const message = 'Project ref is required to open Workspace'
        toast.error(message)
        return { ok: false, denied: false, message }
      }

      setIsLaunching(true)
      try {
        const accessToken = await getAccessToken()
        if (!accessToken) {
          throw new Error('You must be signed in to open Workspace')
        }

        const query = module ? `?module=${encodeURIComponent(module)}` : ''
        const response = await fetch(`/api/platform/projects/${ref}/suite/launch${query}`, {
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
            `Failed to open Workspace (${response.status})`
          if (
            response.status === 403 ||
            payload?.code === SUITE_ROLE_DENIED_CODE ||
            isSuiteRoleDeniedMessage(message)
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
          suiteTeamKey:
            typeof payload.suite_team_key === 'string' ? payload.suite_team_key : undefined,
          suiteProjectKey:
            typeof payload.suite_project_key === 'string' ? payload.suite_project_key : undefined,
          role: typeof payload.role === 'string' ? payload.role : undefined,
          externalProduct:
            payload.external_product === 'email' ? ('email' as const) : undefined,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to open Workspace'
        toast.error(message)
        setIsLaunching(false)
        return { ok: false, denied: false, message }
      }
    },
    [ref]
  )

  return { isLaunching, launch, projectRef: ref }
}
