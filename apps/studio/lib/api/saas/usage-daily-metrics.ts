import { executeQuery } from './query'

export type UsageDailyMetric = 'DATABASE_SIZE' | 'STORAGE_SIZE' | 'MONTHLY_ACTIVE_USERS'

/**
 * Point-in-time snapshot for a project/metric/day. `valueBytes` holds bytes for size metrics
 * and a raw count for count metrics (e.g. MONTHLY_ACTIVE_USERS); the column is a plain bigint.
 */
export async function upsertUsageDailyMetric(opts: {
  projectRef: string
  metric: UsageDailyMetric
  valueBytes: number
  day?: Date
}): Promise<void> {
  const day = opts.day ?? new Date()
  const dayIso = day.toISOString().slice(0, 10)

  const result = await executeQuery({
    query: `
      insert into saas.usage_daily_metrics (day, project_ref, metric, value_bytes, collected_at)
      values ($1::date, $2, $3, $4, now())
      on conflict (day, project_ref, metric)
      do update set
        value_bytes = excluded.value_bytes,
        collected_at = excluded.collected_at
    `,
    parameters: [dayIso, opts.projectRef, opts.metric, opts.valueBytes],
  })
  if (result.error) throw result.error
}
