import type { Session } from '@indobaseinc/indobase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import { createClient } from './client'

type SupabaseContextValue = {
  supabase: ReturnType<typeof createClient>
  session: Session | null
}

const SupabaseContext = createContext<SupabaseContextValue | null>(null)

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const [supabase] = useState(() => createClient())
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => setSession(session))

    return () => subscription.unsubscribe()
  }, [supabase])

  return (
    <SupabaseContext.Provider value={{ supabase, session }}>{children}</SupabaseContext.Provider>
  )
}

export function useSupabaseClient() {
  const ctx = useContext(SupabaseContext)
  if (!ctx) throw new Error('useSupabaseClient must be used within SupabaseProvider')
  return ctx.supabase
}

export function useSession() {
  const ctx = useContext(SupabaseContext)
  if (!ctx) throw new Error('useSession must be used within SupabaseProvider')
  return ctx.session
}
