import { PG_META_URL } from 'lib/constants/index'
import { constructHeaders } from '../apiHelpers'
import { PgMetaDatabaseError, WrappedResult } from './types'
import { assertSelfHosted, encryptString, getConnectionString } from './util'

const missingPgMetaUrlError = () =>
  new Error(
    'STUDIO_PG_META_URL is not set. Self-hosted Studio needs the postgres-meta base URL ' +
      '(e.g. http://meta:8080 from the Studio container).'
  )

export type QueryOptions = {
  query: string
  parameters?: unknown[]
  readOnly?: boolean
  headers?: HeadersInit
}

/**
 * Executes a SQL query against the self-hosted Postgres instance via pg-meta service.
 *
 * _Only call this from server-side self-hosted code._
 */
export async function executeQuery<T = unknown>({
  query,
  parameters,
  readOnly = false,
  headers,
}: QueryOptions): Promise<WrappedResult<T[]>> {
  assertSelfHosted()

  if (!PG_META_URL) {
    return { data: undefined, error: missingPgMetaUrlError() }
  }

  const connectionString = getConnectionString({ readOnly })
  const connectionStringEncrypted = encryptString(connectionString)

  const requestBody: { query: string; parameters?: unknown[] } = { query }
  if (parameters !== undefined) {
    requestBody.parameters = parameters
  }

  const response = await fetch(`${PG_META_URL}/query`, {
    method: 'POST',
    headers: constructHeaders({
      ...headers,
      'Content-Type': 'application/json',
      'x-connection-encrypted': connectionStringEncrypted,
    }),
    body: JSON.stringify(requestBody),
  })

  try {
    const result = await response.json()

    if (!response.ok) {
      // pg-meta error payloads are not always consistent; in particular,
      // `formattedError` may be missing. Never let schema validation crash
      // the self-hosted platform API.
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
