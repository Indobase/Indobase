/// <reference types="vite/types/importMeta.d.ts" />
import { createClient as createIndobaseClient } from '@indobaseinc/indobase-js'

export function createClient() {
  return createIndobaseClient(
    import.meta.env.VITE_SUPABASE_URL!,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!
  )
}
