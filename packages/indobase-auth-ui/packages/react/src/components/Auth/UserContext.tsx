import React, { useEffect, useState, createContext, useContext } from 'react'
import type { AuthSession, AuthUser } from '@indobaseinc/indobase-js'
import type { IndobaseClient } from '@indobaseinc/indobase-js'

export interface UserContextValue {
  user: AuthUser | null
  session: AuthSession | null
}

const UserContext = createContext<UserContextValue>({ user: null, session: null })

export interface Props {
  supabaseClient: IndobaseClient
  [propName: string]: any
}

export const UserContextProvider = (props: Props) => {
  const { supabaseClient } = props
  const [session, setSession] = useState<AuthSession | null>(null)
  const [user, setUser] = useState<AuthUser | null>(session?.user ?? null)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabaseClient.auth.getSession()
      setSession(data.session)
      setUser(data.session?.user ?? null)
    })()

    const { data: authListener } = supabaseClient.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
      }
    )

    return () => {
      authListener?.subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = {
    session,
    user,
  }
  return <UserContext.Provider value={value} {...props} />
}

export const useUser = () => {
  const context = useContext(UserContext)
  if (context === undefined) {
    throw new Error(`useUser must be used within a UserContextProvider.`)
  }
  return context
}
