import { PG_META_URL } from 'lib/constants/index'
import { constructHeaders } from '../apiHelpers'
import { PgMetaDatabaseError, WrappedResult } from './types'
import { assertSaaSBackend, encryptString, getConnectionString } from './util'

const missingPgMetaUrlError = () =>
  new Error(
    'STUDIO_PG_META_URL is not set. SaaS Studio needs the postgres-meta base URL ' +
      '(e.g. http://meta:8080 from the Studio container).'
  )

export type QueryOptions = {
  query: string
  parameters?: unknown[]
  readOnly?: boolean
  headers?: HeadersInit
  /**
   * Optional GoTrue user id (uuid) to set as DB actor for RLS via `set_config('app.uid', ...)`.
   * When provided alongside `parameters`, set_config is injected as a MATERIALIZED CTE
   * (single statement, required by the extended-query protocol). Without `parameters`,
   * it is prepended as a separate statement.
   */
  actorId?: string
}

/**
 * Executes a SQL query against the SaaS Postgres instance via pg-meta service.
 *
 * _Only call this from server-side SaaS code._
 */
export async function executeQuery<T = unknown>({
  query,
  parameters,
  readOnly = false,
  headers,
  actorId,
}: QueryOptions): Promise<WrappedResult<T[]>> {
  assertSaaSBackend()

  if (!PG_META_URL) {
    return { data: undefined, error: missingPgMetaUrlError() }
  }

  const connectionString = getConnectionString({ readOnly })
  const connectionStringEncrypted = encryptString(connectionString)

  // pg-meta uses the extended-query (prepared-statement) protocol whenever
  // `parameters` is present, which rejects multi-statement query strings
  // ("cannot insert multiple commands into a prepared statement"). When we
  // need to set `app.uid` for RLS, inject set_config as a MATERIALIZED CTE
  // so the whole thing is one statement.
  const trimmedActor =
    actorId && typeof actorId === 'string' && actorId.trim() ? actorId.trim() : ''

  let finalQuery = query
  let finalParameters = parameters

  if (trimmedActor) {
    if (parameters !== undefined) {
      const actorParamNum = parameters.length + 1
      const setActorCte = `_set_actor AS MATERIALIZED (SELECT set_config('app.uid', $${actorParamNum}, true))`
      const leadingQuery = query.replace(/^\s+/, '')
      finalQuery = /^with\s/i.test(leadingQuery)
        ? leadingQuery.replace(/^with\s+/i, `WITH ${setActorCte}, `)
        : `WITH ${setActorCte} ${leadingQuery}`
      finalParameters = [...parameters, trimmedActor]
    } else {
      // Simple-query protocol allows multi-statement; keep the simpler form.
      finalQuery = `select set_config('app.uid', '${trimmedActor}', true);\n${query}`
    }
  }

  const requestBody: { query: string; parameters?: unknown[] } = { query: finalQuery }
  if (finalParameters !== undefined) {
    requestBody.parameters = finalParameters
  }

  let response: Response
  try {
    response = await fetch(`${PG_META_URL}/query`, {
      method: 'POST',
      headers: constructHeaders({
        ...headers,
        'Content-Type': 'application/json',
        'x-connection-encrypted': connectionStringEncrypted,
      }),
      body: JSON.stringify(requestBody),
    })
  } catch (error) {
    const cause =
      error instanceof Error && 'cause' in error && error.cause instanceof Error
        ? error.cause.message
        : undefined
    const detail = cause ? `${error instanceof Error ? error.message : 'fetch failed'} (${cause})` : error instanceof Error ? error.message : 'fetch failed'
    return {
      data: undefined,
      error: new Error(
        `Cannot reach postgres-meta at ${PG_META_URL}: ${detail}. ` +
          'Use an internal URL reachable from the Studio container (e.g. http://indobase-meta:8080), not Kong.'
      ),
    }
  }

  try {
    const result = await response.json()

    if (!response.ok) {
      // pg-meta error payloads are not always consistent; in particular,
      // `formattedError` may be missing. Never let schema validation crash
      // the SaaS platform API.
      const raw: any = result
      const message = typeof raw?.message === 'string' ? raw.message : 'Database error'
      const code = typeof raw?.code === 'string' ? raw.code : 'UNKNOWN'
      const formattedError =
        typeof raw?.formattedError === 'string'
          ? raw.formattedError
          : typeof raw?.formatted_error === 'string'
            ? raw.formatted_error
            : ''

      const error = new PgMetaDatabaseError(message, code, response.status, formattedError)
      return { data: undefined, error }
    }

    return { data: result, error: undefined }
  } catch (error) {
    if (error instanceof Error) {
      return { data: undefined, error }
    }
    throw error
  }
}
