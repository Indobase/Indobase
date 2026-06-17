import { SupabaseProvider, useSupabaseClient } from '../lib/supabase/context'
import type { Session } from '@indobaseinc/indobase-js'
import type { AppProps } from 'next/app'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import '../styles/globals.css'

function AuthRedirectListener() {
  const router = useRouter()
  const supabaseClient = useSupabaseClient()

  useEffect(() => {
    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((event) => {
      switch (event) {
        case 'SIGNED_IN':
          router.push('/')
          return
        case 'SIGNED_OUT':
          router.push('/login')
          return
      }
    })
    return () => subscription.unsubscribe()
  }, [router, supabaseClient])

  return null
}

function MyApp({
  Component,
  pageProps,
}: AppProps<{
  initialSession: Session
}>) {
  return (
    <SupabaseProvider initialSession={pageProps.initialSession}>
      <AuthRedirectListener />
      <Component {...pageProps} />
    </SupabaseProvider>
  )
}

export default MyApp
