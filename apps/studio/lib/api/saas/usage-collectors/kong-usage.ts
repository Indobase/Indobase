import { executeQuery } from '../query'

export async function collectProjectKongUsage({
  projectRef,
  periodStart,
}: {
  projectRef: string
  periodStart: Date
}): Promise<{
  egressBytes: number
  requestCount: number
  errorCount: number
}> {
  const row = await executeQuery<{
    egress_bytes: string
    request_count: string
    error_count: string
  }>({
    query: `
      select
        coalesce(sum(bytes_sent), 0)::text as egress_bytes,
        count(*)::text as request_count,
        coalesce(sum(case when status_code >= 400 then 1 else 0 end), 0)::text as error_count
      from saas.usage_events
      where project_ref = $1
        and occurred_at >= $2::timestamptz
    `,
    parameters: [projectRef, periodStart.toISOString()],
  })
  if (row.error) throw row.error
  const r = row.data?.[0]
  return {
    egressBytes: parseInt(r?.egress_bytes ?? '0', 10) || 0,
    requestCount: parseInt(r?.request_count ?? '0', 10) || 0,
    errorCount: parseInt(r?.error_count ?? '0', 10) || 0,
  }
}

export async function hasKongUsageMetering(): Promise<boolean> {
  const row = await executeQuery<{ ok: boolean }>({
    query: `
      select exists (
        select 1 from information_schema.tables
        where table_schema = 'saas' and table_name = 'usage_events'
      ) as ok
    `,
    parameters: [],
  })
  if (row.error) return false
  return Boolean(row.data?.[0]?.ok)
}
