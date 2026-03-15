import { createClient } from '@supabase/supabase-js'

/**
 * Creates a Supabase client using the secret key.
 * For use in server-side API routes only.
 */
export function createAdminClient() {
  const url =
    process.env.NEXT_PUBLIC_INDOBASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL!
  const secret =
    process.env.LIVE_INDOBASE_SECRET_KEY ||
    process.env.LIVE_SUPABASE_SECRET_KEY!
  return createClient(url, secret)
}
