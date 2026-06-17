'use client'

import type { AuthError, Session } from '@indobaseinc/indobase-js'
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { clearLocalStorage } from './constants/local-storage'
import { gotrueClient, STORAGE_KEY, type User } from './gotrue'

export type { User }

/* Auth Context */

type AuthState = {
  session: Session | null
  error: AuthError | null
  isLoading: boolean
}

export type AuthContext = { refreshSession: () => Promise<Session | null> } & AuthState

export const AuthContext = createContext<AuthContext>({
  session: null,
  error: null,
  isLoading: true,
  refreshSession: () => Promise.resolve(null),
})

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [state, setState] = useState<AuthState>({ session: null, error: null, isLoading: true })

  useEffect(() => {
    let mounted = true

    const {
      data: { subscription },
    } = gotrueClient.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setState((prev) => {
        if (prev.isLoading) {
          // Session may arrive via onAuthStateChange before initialize() finishes; keep
          // isLoading true until initialize() completes so route guards do not redirect.
          return {
            session,
            error: session !== null ? null : prev.error,
            isLoading: true,
          }
        }
        return {
          session,
          error: session !== null ? null : prev.error,
          isLoading: false,
        }
      })
    })

    gotrueClient
      .initialize()
      .then(async ({ error }) => {
        if (!mounted) return
        const { data: { session } } = await gotrueClient.getSession()
        if (!mounted) return
        setState((prev) => ({
          session: session ?? prev.session,
          error: error ?? prev.error,
          isLoading: false,
        }))
      })
      .catch((error) => {
        if (!mounted) return
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error : prev.error,
          isLoading: false,
        }))
      })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  // Helper method to refresh the session.
  // For example after a user updates their profile
  const refreshSession = useCallback(async () => {
    const {
      data: { session },
    } = await gotrueClient.refreshSession()

    return session
  }, [])

  const value = useMemo(() => {
    return { ...state, refreshSession } as const
  }, [state, refreshSession])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/* Auth Utils */

export const useAuth = () => useContext(AuthContext)

export const useSession = () => useAuth().session

export const useUser = () => useSession()?.user ?? null

export const useIsUserLoading = () => useAuth().isLoading

/** True after GoTrue `initialize()` has finished (session restored or confirmed absent). */
export const useIsAuthReady = () => !useAuth().isLoading

export const useIsLoggedIn = () => {
  const user = useUser()

  return user !== null
}

export const useAuthError = () => useAuth().error

export const useIsMFAEnabled = () => {
  const user = useUser()

  return user !== null && user.factors && user.factors.length > 0
}

export const signOut = async () => await gotrueClient.signOut()

export const logOut = async () => {
  await signOut()
  clearLocalStorage()
}

let currentSession: Session | null = null

gotrueClient.onAuthStateChange((event, session) => {
  currentSession = session
})

/**
 * Gets a current access token.
 *
 * Calls getSession, which will refresh the token if needed.
 */
export async function getAccessToken() {
  // ignore if server-side
  if (typeof window === 'undefined') return undefined

  const {
    data: { session },
    error,
  } = await gotrueClient.getSession()
  if (error) {
    throw error
  }

  // In some auth timing/storage mismatch scenarios, `getSession()` may return null
  // even though the token was just issued. Fall back to the persisted session
  // payload from localStorage so API calls still carry Authorization header.
  if (session?.access_token) return session.access_token

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return undefined

    const parsed = JSON.parse(raw)
    const token =
      parsed?.access_token ??
      // Older shapes may nest under session
      parsed?.session?.access_token ??
      parsed?.data?.session?.access_token

    return typeof token === 'string' ? token : undefined
  } catch {
    return undefined
  }
}
