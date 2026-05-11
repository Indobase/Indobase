import { createClient, type SupabaseClient } from 'indobase-js'

/**
 * Creates a service-role Supabase client for the SaaS Studio backend.
 *
 * Module-scope `createClient(...)` calls were causing every request through
 * the storage / auth proxy handlers to 500 when one of the env vars was
 * temporarily unset (Next.js evaluates the module the first time the route
 * is imported). Calling this lazily inside the request handler gives a clear
 * 503 instead, and lets us reuse the client across handlers in the same
 * process.
 */
let cachedClient: SupabaseClient | null = null

export function getStorageAdminClient(): SupabaseClient {
  if (cachedClient) return cachedClient

  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY

  if (!url) {
    throw new Error(
      'SUPABASE_URL is not set on Studio. Set it to your Kong base URL (e.g. http://indobase-kong:8000).'
    )
  }
  if (!serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_KEY is not set on Studio. Set it to your service-role JWT (must match the JWT_SECRET used by GoTrue).'
    )
  }

  cachedClient = createClient(url, serviceKey)
  return cachedClient
}
