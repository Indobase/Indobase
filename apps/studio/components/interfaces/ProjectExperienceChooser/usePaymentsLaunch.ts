import { getAccessToken, useParams } from 'common'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import {
  isPaymentsRoleDeniedMessage,
  PAYMENTS_ROLE_DENIED_CODE,
} from 'lib/api/saas/payments-launch-shared'

type UsePaymentsLaunchOptions = {
  projectRef?: string
}

export type PaymentsLaunchResult =
  | { ok: true; url: string; paymentsTenantSlug?: string; role?: string }
  | { ok: false; denied: true; message: string }
  | { ok: false; denied: false; message: string }

export function usePaymentsLaunch(options?: UsePaymentsLaunchOptions) {
  const params = useParams()
  const ref = options?.projectRef || params.ref
  const [isLaunching, setIsLaunching] = useState(false)

  const launch = useCallback(async (): Promise<PaymentsLaunchResult> => {
    if (!ref) {
      const message = 'Project ref is required to open Payments'
      toast.error(message)
      return { ok: false, denied: false, message }
    }

    setIsLaunching(true)
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) {
        throw new Error('You must be signed in to open Payments')
      }

      const response = await fetch(`/api/platform/projects/${ref}/payments/launch`, {
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
          `Failed to open Payments (${response.status})`
        if (
          response.status === 403 ||
          payload?.code === PAYMENTS_ROLE_DENIED_CODE ||
          isPaymentsRoleDeniedMessage(message)
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
        paymentsTenantSlug:
          typeof payload.payments_tenant_slug === 'string'
            ? payload.payments_tenant_slug
            : undefined,
        role: typeof payload.role === 'string' ? payload.role : undefined,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open Payments'
      toast.error(message)
      setIsLaunching(false)
      return { ok: false, denied: false, message }
    }
  }, [ref])

  return { isLaunching, launch, projectRef: ref }
}
