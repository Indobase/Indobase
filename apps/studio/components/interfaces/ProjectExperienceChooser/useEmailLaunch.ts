import { getAccessToken, useParams } from 'common'
import { useCallback, useState } from 'react'

import {
  EMAIL_ROLE_DENIED_CODE,
  isEmailRoleDeniedMessage,
} from 'lib/api/saas/email-launch-shared'

type UseEmailLaunchOptions = {
  projectRef?: string
}

export type EmailLaunchResult =
  | { ok: true; url: string; emailWorkspaceId?: string; role?: string }
  | { ok: false; denied: true; message: string }
  | { ok: false; denied: false; message: string }

export function useEmailLaunch(options?: UseEmailLaunchOptions) {
  const params = useParams()
  const ref = options?.projectRef || params.ref
  const [isLaunching, setIsLaunching] = useState(false)

  const launch = useCallback(async (): Promise<EmailLaunchResult> => {
    if (!ref) {
      const message = 'Project ref is required to open Email'
      return { ok: false, denied: false, message }
    }

    setIsLaunching(true)
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) {
        throw new Error('You must be signed in to open Email')
      }

      const response = await fetch(`/api/platform/projects/${ref}/email/launch`, {
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
          `Failed to open Email (${response.status})`
        if (
          response.status === 403 ||
          payload?.code === EMAIL_ROLE_DENIED_CODE ||
          isEmailRoleDeniedMessage(message)
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
        emailWorkspaceId:
          typeof payload.email_workspace_id === 'string'
            ? payload.email_workspace_id
            : undefined,
        role: typeof payload.role === 'string' ? payload.role : undefined,
      }
    } catch (error) {
      // Caller (WorkspaceLauncher) owns the inline error banner — avoid toast+banner double flash.
      const message = error instanceof Error ? error.message : 'Failed to open Email'
      setIsLaunching(false)
      return { ok: false, denied: false, message }
    }
  }, [ref])

  return { isLaunching, launch, projectRef: ref }
}
