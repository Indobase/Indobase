import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/router'
import { PropsWithChildren, useCallback, useEffect } from 'react'
import { toast } from 'sonner'

import {
  AuthProvider as AuthProviderInternal,
  clearLocalStorage,
  gotrueClient,
  posthogClient,
  useAuthError,
} from 'common'
import { useAiAssistantStateSnapshot } from 'state/ai-assistant-state'
import { GOTRUE_ERRORS, IS_MULTI_ORG_DASHBOARD } from './constants'

const UNAUTH_ROUTES = [
  '/sign-in',
  '/sign-in-mfa',
  '/sign-in-sso',
  '/sign-in-partner',
  '/sign-in-fly-tos',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
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
    if (error !== null) {
      // Check for unverified GitHub users after a GitHub sign in
      if (error.message === GOTRUE_ERRORS.UNVERIFIED_GITHUB_USER) {
        toast.error(
          'Please verify your email on GitHub first, then reach out to us at support@supabase.io to log into the dashboard'
        )
        return
      }

      toast.error(error.message)
    }

    toast.error(error.message)
  }, [error, router.pathname])

  return children
}

export const AuthProvider = ({ children }: PropsWithChildren) => {
  return (
    <AuthProviderInternal alwaysLoggedIn={!IS_MULTI_ORG_DASHBOARD}>
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
