import { PROJECT_ANALYTICS_URL } from 'lib/constants/api'
import {
  emptyUsageAnalyticsResult,
  hasAnalyticsPayloadError,
  mapAnalyticsQueryParams,
} from './analyticsUsage'
import { WrappedResult } from './types'
import { assertSaaSBackend } from './util'
import assert from 'node:assert'
import { LogsService } from '@supabase/mcp-server-supabase/platform'
import { stripIndent } from 'common-tags'

export type RetrieveAnalyticsDataOptions = {
  name: string
  projectRef: string
  params: Record<string, string | undefined>
}

export type AnalyticsResult = {
  result?: any[]
  error?: {
    message: string
  }
  [key: string]: any
}

/**
 * Retrieves analytics data from Logflare.
 *
 * _Only call this from server-side SaaS code._
 */
export async function retrieveAnalyticsData({
  name,
  projectRef,
  params,
}: RetrieveAnalyticsDataOptions): Promise<WrappedResult<AnalyticsResult>> {
  if (!PROJECT_ANALYTICS_URL || !process.env.LOGFLARE_PRIVATE_ACCESS_TOKEN) {
    return {
      data: undefined,
      error: new Error(
        `Analytics is not configured: ${
          [!PROJECT_ANALYTICS_URL ? 'PROJECT_ANALYTICS_URL' : null, !process.env.LOGFLARE_PRIVATE_ACCESS_TOKEN ? 'LOGFLARE_PRIVATE_ACCESS_TOKEN' : null]
            .filter(Boolean)
            .join(', ')
        } is missing`
      ),
    }
  }

  const mappedParams = mapAnalyticsQueryParams(params)
  const url = new URL(`${PROJECT_ANALYTICS_URL}endpoints/query/${name}`)
  url.searchParams.set('project', projectRef)

  Object.entries(mappedParams).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.set(key, value)
    }
  })

  const accessToken = process.env.LOGFLARE_PRIVATE_ACCESS_TOKEN

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })

    const result = (await response.json()) as AnalyticsResult

    if (!response.ok) {
      if (name.startsWith('usage.')) {
        return { data: emptyUsageAnalyticsResult(), error: undefined }
      }
      const error = new Error(
        (typeof result?.error === 'object' && result?.error?.message) ||
          (typeof result?.error === 'string' ? result.error : null) ||
          `Failed to retrieve analytics data: ${response.statusText}`
      )
      return { data: undefined, error }
    }

    if (hasAnalyticsPayloadError(result) && name.startsWith('usage.')) {
      return { data: emptyUsageAnalyticsResult(), error: undefined }
    }

    return { data: result, error: undefined }
  } catch (error) {
    if (error instanceof Error) {
      return { data: undefined, error }
    }
    throw error
  }
}

export function getLogQuery(service: LogsService, limit: number = 100): string {
  assertSaaSBackend()

  switch (service) {
    case 'api': {
      return stripIndent`
        select id, edge_logs.timestamp, event_message, request.method, request.path, request.search, response.status_code
        from edge_logs
        cross join unnest(metadata) as m
        cross join unnest(m.request) as request
        cross join unnest(m.response) as response
        order by timestamp desc
        limit ${limit};
      `
    }
    case 'branch-action': {
      throw new Error('Branching is only supported in the hosted Indobase platform')
    }
    case 'postgres': {
      return stripIndent`
        select postgres_logs.timestamp, id, event_message, parsed.error_severity, parsed.detail, parsed.hint
        from postgres_logs
        cross join unnest(metadata) as m
        cross join unnest(m.parsed) as parsed
        order by timestamp desc
        limit ${limit};
      `
    }
    case 'edge-function': {
      return stripIndent`
        select id, function_edge_logs.timestamp, event_message
        from function_edge_logs
        order by timestamp desc
        limit ${limit}
      `
    }
    case 'auth': {
      return stripIndent`
        select id, auth_logs.timestamp, event_message, metadata.level, metadata.status, metadata.path, metadata.msg as msg, metadata.error from auth_logs
        cross join unnest(metadata) as metadata
        order by timestamp desc
        limit ${limit};
      `
    }
    case 'storage': {
      return stripIndent`
        select id, storage_logs.timestamp, event_message from storage_logs
        order by timestamp desc
        limit ${limit};
      `
    }
    case 'realtime': {
      return stripIndent`
        select id, realtime_logs.timestamp, event_message from realtime_logs
        order by timestamp desc
        limit ${limit};
      `
    }
    default: {
      throw new Error(`Unsupported log service: ${service}`)
    }
  }
}
