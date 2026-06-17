import { SupabaseProvider } from '@/lib/supabase/context'
import '@/styles/app.css'
import type { AppProps } from 'next/app'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <SupabaseProvider>
      <Component {...pageProps} />
    </SupabaseProvider>
  )
}
