import type { JwtPayload } from '@indobaseinc/indobase-js'
import { executeQuery } from './query'

type Claims = JwtPayload & Record<string, any>

export type AuditAction =
  | 'org.create'
  | 'org.update'
  | 'org.delete'
  | 'org.member.added'
  | 'org.member.removed'
  | 'org.member.role_changed'
  | 'org.invite.created'
  | 'org.invite.revoked'
  | 'org.invite.accepted'
  | 'project.create'
  | 'project.update'
  | 'project.delete'
  | 'project.pause'
  | 'project.restore'
  | 'project.restart'
  | 'project.api_key.rotated'
  | 'project.custom_domain.added'
  | 'project.custom_domain.removed'
  | 'project.custom_domain.activated'
  | 'project.deployment.requested'
  | 'project.deployment.updated'
  | 'project.mobile_build.requested'
  | 'project.mobile_build.updated'
  | 'project.ssl_enforcement.updated'
  | 'project.third_party_auth.added'
  | 'project.third_party_auth.removed'
  | 'project.third_party_auth.updated'
  | 'user.delete'
  | 'user.login'
  | 'platform.org.suspended'
  | 'platform.org.unsuspended'
  | 'platform.org.owner_transferred'
  | 'platform.org.billing_updated'
  | 'platform.org.support_note'
  | 'platform.user.suspended'
  | 'platform.user.unsuspended'

export type AuditTargetType =
  | 'organization'
  | 'project'
  | 'user'
  | 'api_key'
  | 'custom_domain'
  | 'deployment'
  | 'build'
  | 'third_party_auth'
  | 'invite'

type RecordAuditLogParams = {
  claims?: Claims
  organizationId?: number | null
  projectRef?: string | null
  action: AuditAction
  targetType: AuditTargetType
  targetDescription?: string
  metadata?: Record<string, unknown>
  ip?: string | null
  userAgent?: string | null
}

const getActorFromClaims = (claims: Claims | undefined) => {
  if (!claims) return { id: null as string | null, email: null as string | null }
  const normalized: any =
    claims && typeof (claims as any).claims === 'object' ? (claims as any).claims : claims
  const id =
    (normalized?.sub as string | undefined) ??
    (normalized?.id as string | undefined) ??
    (normalized?.user_id as string | undefined) ??
    null
  const email =
    (normalized?.email as string | undefined) ??
    (normalized?.user_metadata?.email as string | undefined) ??
    null
  return { id: id || null, email: email || null }
}

/**
 * Records an audit log entry. Best-effort: never throws — auditing should not
 * break primary mutations. Errors are logged to stderr instead.
 */
export async function recordAuditLog({
  claims,
  organizationId = null,
  projectRef = null,
  action,
  targetType,
  targetDescription,
  metadata,
  ip,
  userAgent,
}: RecordAuditLogParams): Promise<void> {
  try {
    const { id: actorId, email: actorEmail } = getActorFromClaims(claims)

    await executeQuery({
      query: `
        insert into saas.audit_logs (
          organization_id,
          project_ref,
          actor_gotrue_id,
          actor_email,
          action,
          target_type,
          target_description,
          metadata,
          ip,
          user_agent
        ) values ($1, $2, $3::uuid, $4, $5, $6, $7, $8::jsonb, $9, $10)
      `,
      parameters: [
        organizationId,
        projectRef,
        actorId,
        actorEmail,
        action,
        targetType,
        targetDescription ?? null,
        JSON.stringify(metadata ?? {}),
        ip ?? null,
        userAgent ?? null,
      ],
      // We intentionally don't pass an `actorId` here so the underlying
      // executeQuery doesn't enforce app.uid — service writes should land
      // even if the actor's RLS context isn't available.
    })
  } catch (err) {
    // Don't crash the calling mutation. Log and move on.
    // eslint-disable-next-line no-console
    console.warn('[audit] failed to record audit log entry:', err)
  }
}

/** Reads recent audit logs for an organization (members only via RLS). */
export async function listOrganizationAuditLogs({
  claims,
  organizationId,
  startIso,
  endIso,
  limit = 200,
}: {
  claims: Claims
  organizationId: number
  startIso?: string
  endIso?: string
  limit?: number
}) {
  const actor = getActorFromClaims(claims)
  if (!actor.id) throw new Error('Missing gotrue user id')

  const params: unknown[] = [organizationId]
  let where = `organization_id = $1`
  if (startIso) {
    params.push(startIso)
    where += ` and occurred_at >= $${params.length}::timestamptz`
  }
  if (endIso) {
    params.push(endIso)
    where += ` and occurred_at <= $${params.length}::timestamptz`
  }
  params.push(Math.min(Math.max(limit, 1), 1000))

  const result = await executeQuery<{
    id: string
    organization_id: number | null
    project_ref: string | null
    actor_gotrue_id: string | null
    actor_email: string | null
    action: string
    target_type: string
    target_description: string | null
    metadata: any
    ip: string | null
    user_agent: string | null
    occurred_at: string
  }>({
    query: `
      select
        id::text as id,
        organization_id,
        project_ref,
        actor_gotrue_id::text as actor_gotrue_id,
        actor_email,
        action,
        target_type,
        target_description,
        metadata,
        ip,
        user_agent,
        occurred_at
      from saas.audit_logs
      where ${where}
      order by occurred_at desc
      limit $${params.length}
    `,
    parameters: params,
    actorId: actor.id,
  })
  if (result.error) throw result.error
  return result.data ?? []
}

/** Reads recent audit logs visible to the current user (any membership). */
export async function listProfileAuditLogs({
  claims,
  startIso,
  endIso,
  limit = 200,
}: {
  claims: Claims
  startIso?: string
  endIso?: string
  limit?: number
}) {
  const actor = getActorFromClaims(claims)
  if (!actor.id) throw new Error('Missing gotrue user id')

  const params: unknown[] = []
  const conditions: string[] = []
  if (startIso) {
    params.push(startIso)
    conditions.push(`occurred_at >= $${params.length}::timestamptz`)
  }
  if (endIso) {
    params.push(endIso)
    conditions.push(`occurred_at <= $${params.length}::timestamptz`)
  }
  // RLS already restricts to orgs the user is a member of; we just need an
  // ordering and an upper bound.
  params.push(Math.min(Math.max(limit, 1), 1000))

  const where = conditions.length ? `where ${conditions.join(' and ')}` : ''
  const result = await executeQuery<{
    id: string
    organization_id: number | null
    project_ref: string | null
    actor_gotrue_id: string | null
    actor_email: string | null
    action: string
    target_type: string
    target_description: string | null
    metadata: any
    ip: string | null
    user_agent: string | null
    occurred_at: string
  }>({
    query: `
      select
        id::text as id,
        organization_id,
        project_ref,
        actor_gotrue_id::text as actor_gotrue_id,
        actor_email,
        action,
        target_type,
        target_description,
        metadata,
        ip,
        user_agent,
        occurred_at
      from saas.audit_logs
      ${where}
      order by occurred_at desc
      limit $${params.length}
    `,
    parameters: params,
    actorId: actor.id,
  })
  if (result.error) throw result.error
  return result.data ?? []
}
