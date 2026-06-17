import { SupabaseClient } from '@indobaseinc/indobase-js'
import type { Database } from '@/utils/database.types'

export type TypedSupabaseClient = SupabaseClient<Database>
