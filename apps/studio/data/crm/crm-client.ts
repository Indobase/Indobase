import { createClient, type IndobaseClient } from '@indobaseinc/indobase-js'

import { getOrRefreshCrmAccessToken } from './crm-access-token'
import type { CrmDatabase } from './crm.types'

/**
 * The PostgREST client every CRM read and write goes through.
 *
 * It talks to the project's own API endpoint with the project's publishable key as `apikey` and a
 * short-lived `authenticated` token as the bearer (see `crm-access-token`). That means:
 *
 *  - RLS is applied by Postgres on every statement. Nothing in `data/crm/` filters by
 *    `project_ref`; the policies already do, and a hand-written filter that disagrees with them is
 *    worse than none.
 *
 * `db.schema` is pinned to `crm`, so `.from('companies')` resolves to `crm.companies`.
 */
export type CrmClient = IndobaseClient<CrmDatabase, 'crm'>

export type CrmClientVariables = {
  projectRef?: string
  /** Project API endpoint, e.g. from `useProjectEndpointQuery`. */
  endpoint?: string
  /** Project publishable (or legacy anon) key, e.g. from `getKeys(useAPIKeysQuery(...).data)`. */
  apiKey?: string
  /** The signed-in Studio user's `profile.gotrue_id`. */
  gotrueId?: string
  email?: string
}

export type ResolvedCrmClientVariables = {
  projectRef: string
  endpoint: string
  apiKey: string
  gotrueId: string
  email?: string
}

/**
 * Narrows the loosely-typed variables the hooks carry around. Throws with a specific message
 * rather than returning undefined, because a CRM surface that renders "no deals" when it actually
 * failed to build a client is impossible to debug.
 */
export function resolveCrmClientVariables(vars: CrmClientVariables): ResolvedCrmClientVariables {
  const { projectRef, endpoint, apiKey, gotrueId, email } = vars
  if (!projectRef) throw new Error('Project ref is required for CRM')
  if (!endpoint) throw new Error('Project API endpoint is required for CRM')
  if (!apiKey) throw new Error('Project publishable key is required for CRM')
  if (!gotrueId) throw new Error('You must be signed in to open CRM')
  return { projectRef, endpoint, apiKey, gotrueId, email }
}

export function hasCrmClientVariables(
  vars: CrmClientVariables
): vars is CrmClientVariables & ResolvedCrmClientVariables {
  return !!vars.projectRef && !!vars.endpoint && !!vars.apiKey && !!vars.gotrueId
}

/**
 * One client per (project, endpoint, user). Handing every call a fresh client would rebuild the
 * accessToken closure and lose any in-flight token cache.
 */
const clients = new Map<string, CrmClient>()

export function getCrmClient(vars: CrmClientVariables): CrmClient {
  const { projectRef, endpoint, apiKey, gotrueId, email } = resolveCrmClientVariables(vars)

  const cacheKey = `${projectRef}::${endpoint}::${gotrueId}`
  const cached = clients.get(cacheKey)
  if (cached !== undefined) return cached

  const client = createClient<CrmDatabase, 'crm'>(endpoint, apiKey, {
    db: { schema: 'crm' },
    global: {
      headers: {
        'Accept-Profile': 'crm',
        'Content-Profile': 'crm',
      },
    },
    // Supplying `accessToken` puts the client in "bring your own auth" mode: it never reads or
    // writes a GoTrue session of its own, and it uses this token for every PostgREST request.
    accessToken: async () => {
      const { token } = await getOrRefreshCrmAccessToken({ projectRef, gotrueId, email })
      return token
    },
  })

  clients.set(cacheKey, client)
  return client
}
