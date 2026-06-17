import IndobaseClient from './IndobaseClient'
import type { IndobaseClientOptions } from './lib/types'

export * from '@indobaseinc/auth-js'
export type { User as AuthUser, Session as AuthSession } from '@indobaseinc/auth-js'
export type {
  PostgrestResponse,
  PostgrestSingleResponse,
  PostgrestMaybeSingleResponse,
} from '@indobaseinc/postgrest-js'
export { PostgrestError } from '@indobaseinc/postgrest-js'
export type { FunctionInvokeOptions } from '@indobaseinc/functions-js'
export {
  FunctionsHttpError,
  FunctionsFetchError,
  FunctionsRelayError,
  FunctionsError,
  FunctionRegion,
} from '@indobaseinc/functions-js'
export * from '@indobaseinc/realtime-js'
export { default as IndobaseClient } from './IndobaseClient'
export type {
  IndobaseClientOptions,
  QueryResult,
  QueryData,
  QueryError,
  DatabaseWithoutInternals,
} from './lib/types'

/**
 * Creates a new Supabase Client.
 *
 * @example
 * ```ts
 * import { createClient } from 'indobase-js'
 *
 * const supabase = createClient('https://xyzcompany.indobase.in', 'public-anon-key')
 * const { data, error } = await supabase.from('profiles').select('*')
 * ```
 */
export const createClient = <
  Database = any,
  SchemaNameOrClientOptions extends
    | (string & keyof Omit<Database, '__InternalSupabase'>)
    | { PostgrestVersion: string } = 'public' extends keyof Omit<Database, '__InternalSupabase'>
    ? 'public'
    : string & keyof Omit<Database, '__InternalSupabase'>,
  SchemaName extends string &
    keyof Omit<Database, '__InternalSupabase'> = SchemaNameOrClientOptions extends string &
    keyof Omit<Database, '__InternalSupabase'>
    ? SchemaNameOrClientOptions
    : 'public' extends keyof Omit<Database, '__InternalSupabase'>
      ? 'public'
      : string & keyof Omit<Omit<Database, '__InternalSupabase'>, '__InternalSupabase'>,
>(
  projectUrl: string,
  apiKey: string,
  options?: IndobaseClientOptions<SchemaName>
): IndobaseClient<Database, SchemaNameOrClientOptions, SchemaName> => {
  return new IndobaseClient<Database, SchemaNameOrClientOptions, SchemaName>(
    projectUrl,
    apiKey,
    options
  )
}

// Check for Node.js <= 18 deprecation
function shouldShowDeprecationWarning(): boolean {
  // Skip in browser environments
  if (typeof window !== 'undefined') {
    return false
  }

  // Skip if process is not available (e.g., Edge Runtime)
  // Use dynamic property access to avoid Next.js Edge Runtime static analysis warnings
  const _process = (globalThis as any)['process']
  if (!_process) {
    return false
  }

  const processVersion = _process['version']
  if (processVersion === undefined || processVersion === null) {
    return false
  }

  const versionMatch = processVersion.match(/^v(\d+)\./)
  if (!versionMatch) {
    return false
  }

  const majorVersion = parseInt(versionMatch[1], 10)
  return majorVersion <= 18
}

if (shouldShowDeprecationWarning()) {
  console.warn(
    `⚠️  Node.js 18 and below are deprecated and will no longer be supported in future versions of indobase-js. ` +
      `Please upgrade to Node.js 20 or later. ` +
      `For more information, visit: https://github.com/orgs/Indobase/discussions/37217`
  )
}
