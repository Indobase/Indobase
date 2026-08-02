import { useQueryClient } from '@tanstack/react-query'
import { ensureRuntimePublicEnv } from 'common/public-env'
import { useRouter } from 'next/router'
import { PropsWithChildren, useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import {
  AuthProvider as AuthProviderInternal,
  clearLocalStorage,
  gotrueClient,
  posthogClient,
  useAuthError,
} from 'common'
import { useAiAssistantStateSnapshot } from 'state/ai-assistant-state'
import { LogoLoader } from 'ui'

import { BASE_PATH, GOTRUE_ERRORS } from './constants'

export const UNAUTH_ROUTES = [
  '/sign-in',
  '/sign-in-mfa',
  '/sign-in-sso',
  '/sign-in-partner',
  '/sign-in-fly-tos',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/auth/confirm',
]

const isUnactionableFetchError = (message: string | undefined) => {
  if (!message) return true
  const lower = message.toLowerCase()
  return (
    lower.includes('failed to fetch') ||
    lower.includes('network request failed') ||
    lower.includes('networkerror') ||
    lower.includes('load failed')
  )
}

const AuthErrorToaster = ({ children }: PropsWithChildren) => {
  const error = useAuthError()
  const router = useRouter()

  useEffect(() => {
    if (error === null) return

    // Suppress initialization/session errors on unauthenticated pages — the user
    // hasn't attempted an action yet, so the toast is just noise.
    const onUnauthRoute = UNAUTH_ROUTES.some((p) => router.pathname.startsWith(p))
    if (onUnauthRoute) return

    // Network-level failures from the GoTrue client aren't actionable by the user.
    if (isUnactionableFetchError(error.message)) return

    // Check for unverified GitHub users after a GitHub sign in
    if (error.message === GOTRUE_ERRORS.UNVERIFIED_GITHUB_USER) {
      toast.error(
        'Please verify your email on GitHub first, then reach out to us at support@indobase.in to log into the dashboard'
      )
      return
    }

    toast.error(error.message)
  }, [error, router.pathname])

  return children
}

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [bootstrapped, setBootstrapped] = useState(false)

  useEffect(() => {
    const RUNTIME_ENV_TIMEOUT_MS = 8_000
    const bootstrap = ensureRuntimePublicEnv(`${BASE_PATH}/api/platform/runtime-public-env`)
    const timeout = new Promise<void>((resolve) => {
      setTimeout(resolve, RUNTIME_ENV_TIMEOUT_MS)
    })
    void Promise.race([bootstrap, timeout]).finally(() => setBootstrapped(true))
  }, [])

  if (!bootstrapped) {
    return <LogoLoader />
  }

  return (
    <AuthProviderInternal>
      <AuthErrorToaster>{children}</AuthErrorToaster>
    </AuthProviderInternal>
  )
}

export function useSignOut() {
  const queryClient = useQueryClient()
  const { clearStorage: clearAssistantStorage } = useAiAssistantStateSnapshot()

  return useCallback(async () => {
    const result = await gotrueClient.signOut()
    posthogClient.reset()
    clearLocalStorage()
    // Clear Assistant IndexedDB
    await clearAssistantStorage()
    queryClient.clear()

    return result
  }, [queryClient, clearAssistantStorage])
}
