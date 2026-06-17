import type { JwtPayload } from '@indobaseinc/indobase-js'

import { ensureSaasTables, getGotrueUserId } from 'lib/api/saas/platform'
import { executeQuery } from 'lib/api/saas/query'

type Claims = JwtPayload & Record<string, any>

export type UserNotificationRow = {
  id: string
  name: string
  priority: 'Critical' | 'Warning' | 'Info'
  status: 'new' | 'seen' | 'archived'
  data: unknown
  meta: unknown
  inserted_at: string
}

function parseStatusFilter(raw: string | undefined): ('new' | 'seen' | 'archived')[] | null {
  if (!raw?.trim()) return null
  const parts = raw.split(',').map((s) => s.trim().toLowerCase())
  const allowed = new Set(['new', 'seen', 'archived'])
  const out = parts.filter((p): p is 'new' | 'seen' | 'archived' => allowed.has(p))
  return out.length ? out : null
}

export async function listUserNotifications({
  claims,
  offset,
  limit,
  status,
}: {
  claims: Claims
  offset: number
  limit: number
  status?: string
}) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const statuses = parseStatusFilter(status) ?? ['new', 'seen']

  const rows = await executeQuery<{
    id: string
    name: string
    priority: string
    status: string
    data: unknown
    meta: unknown
    inserted_at: string
  }>({
    query: `
      select id::text, name, priority, status, data, meta, inserted_at::text
      from saas.user_notifications
      where gotrue_id = $1::uuid
        and status = any($2::text[])
      order by inserted_at desc
      limit $3 offset $4
    `,
    parameters: [gotrueId, statuses, limit, offset],
    actorId: gotrueId,
  })

  if (rows.error) throw rows.error

  return (rows.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    priority: (['Critical', 'Warning', 'Info'].includes(r.priority) ? r.priority : 'Info') as UserNotificationRow['priority'],
    status: r.status as UserNotificationRow['status'],
    data: r.data ?? {},
    meta: r.meta ?? {},
    inserted_at: r.inserted_at,
  }))
}

export async function updateUserNotificationStatuses({
  claims,
  updates,
}: {
  claims: Claims
  updates: { id: string; status: 'new' | 'seen' | 'archived' }[]
}) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  if (!updates.length) return []

  const out: UserNotificationRow[] = []
  for (const u of updates) {
    const rows = await executeQuery<{
      id: string
      name: string
      priority: string
      status: string
      data: unknown
      meta: unknown
      inserted_at: string
    }>({
      query: `
        update saas.user_notifications
        set status = $3, updated_at = now()
        where id = $1::uuid and gotrue_id = $2::uuid
        returning id::text, name, priority, status, data, meta, inserted_at::text
      `,
      parameters: [u.id, gotrueId, u.status],
      actorId: gotrueId,
    })
    if (rows.error) throw rows.error
    const r = rows.data?.[0]
    if (r) {
      out.push({
        id: r.id,
        name: r.name,
        priority: r.priority as UserNotificationRow['priority'],
        status: r.status as UserNotificationRow['status'],
        data: r.data ?? {},
        meta: r.meta ?? {},
        inserted_at: r.inserted_at,
      })
    }
  }
  return out
}

export async function archiveAllUserNotifications({ claims }: { claims: Claims }) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)

  const res = await executeQuery({
    query: `
      update saas.user_notifications
      set status = 'archived', updated_at = now()
      where gotrue_id = $1::uuid and status <> 'archived'
    `,
    parameters: [gotrueId],
    actorId: gotrueId,
  })
  if (res.error) throw res.error
}

export async function notificationsSummary({ claims }: { claims: Claims }) {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)

  const rows = await executeQuery<{
    unread: string
    critical: string
    warning: string
  }>({
    query: `
      select
        count(*) filter (where status = 'new')::text as unread,
        count(*) filter (where priority = 'Critical' and status = 'new')::text as critical,
        count(*) filter (where priority = 'Warning' and status = 'new')::text as warning
      from saas.user_notifications
      where gotrue_id = $1::uuid
    `,
    parameters: [gotrueId],
    actorId: gotrueId,
  })

  if (rows.error) throw rows.error
  const row = rows.data?.[0]
  return {
    unread_count: Number(row?.unread ?? 0),
    has_critical: Number(row?.critical ?? 0) > 0,
    has_warning: Number(row?.warning ?? 0) > 0,
  }
}
