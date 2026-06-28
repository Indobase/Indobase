import * as Sentry from '@sentry/nextjs'
import { useMutation } from '@tanstack/react-query'
import { getAccessToken } from 'common'

import { post } from 'data/fetchers'
import type { ResponseError, UseCustomMutationOptions } from 'types'

const TOKEN_RETRY_ATTEMPTS = 5
const TOKEN_RETRY_DELAY_MS = 100

async function waitForAccessToken(): Promise<string | undefined> {
  for (let attempt = 0; attempt < TOKEN_RETRY_ATTEMPTS; attempt++) {
    const token = await getAccessToken()
    if (token) return token
    if (attempt < TOKEN_RETRY_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, TOKEN_RETRY_DELAY_MS))
    }
  }
  return undefined
}

/**
 * Records a login audit event. Best-effort: failures are logged but never
 * surfaced to the user — auditing should not interrupt sign-in.
 */
export async function addLoginEvent() {
  try {
    const token = await waitForAccessToken()
    if (!token) {
      console.warn('[audit-login] skipped: no access token available after sign-in')
      return
    }

    const { error } = await post('/platform/profile/audit-login')
    if (error) {
      console.warn('[audit-login] API returned error:', error)
      Sentry.captureException(
        new Error("Failed to add login event to user's audit log", { cause: error })
      )
    }
  } catch (err) {
    console.warn('[audit-login] request failed:', err)
    Sentry.captureException(err)
  }
}

type AddLoginEventVariables = {}
type AddLoginEventData = Awaited<ReturnType<typeof addLoginEvent>>

export const useAddLoginEvent = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<AddLoginEventData, ResponseError, AddLoginEventVariables>,
  'mutationFn'
> = {}) => {
  return useMutation<AddLoginEventData, ResponseError, AddLoginEventVariables>({
    mutationFn: () => addLoginEvent(),
    async onSuccess(data, variables, context) {
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      Sentry.captureException(
        new Error("Failed to add login event to user's audit log", { cause: data })
      )
      if (onError === undefined) {
        console.error(`Failed to add login event: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
