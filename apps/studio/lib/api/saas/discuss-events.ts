/**
 * Indobase Discuss — platform event publisher (server-side only).
 *
 * Thin wrapper over `discuss.publish_event(project_ref, event_type, event_data)` in the TENANT
 * database. This is the feature that justified building Discuss rather than forking a chat
 * product: deploys, builds, payments and KYC decisions land as cards in the project's Activity
 * channel, beside the conversation about them.
 *
 * Two rules govern everything in this file:
 *
 * 1. Publishing is best-effort and NEVER propagates. A failed event write is a missing card, not
 *    a failed deployment. Same contract as `recordAuditLog` in ./audit, and it is called from the
 *    same places for the same reason.
 * 2. `publish_event` returns null when the project has no Activity channel yet (nobody has ever
 *    opened Discuss for it). That is the documented, expected outcome — not an error. It is
 *    reported as `{ published: false, reason: 'no_activity_channel' }` and logged at debug level.
 *
 * RLS note: `discuss.publish_event` is SECURITY DEFINER *in the schema itself*, because the
 * publisher is a platform service and has no member row. Nothing here weakens that boundary —
 * this module cannot read messages, only append one event to one project's activity channel, and
 * it never passes an `actorId` (there is no user acting).
 */

import { resolveProjectDatabaseUrl } from './project-database-url'
import { executeQuery } from './query'
import { PgMetaDatabaseError } from './types'
import { encryptedConnectionForPgMeta } from './util'
import type { DiscussEventDataMap, DiscussEventType } from './discuss-events-shared'

export type PublishDiscussEventResult = {
  published: boolean
  /** Id of the created `discuss.messages` row, when one was created. */
  messageId: string | null
  reason:
    | 'published'
    /** Project has no Activity channel yet — Discuss was never opened. Expected. */
    | 'no_activity_channel'
    /** No tenant database resolved for this ref (unprovisioned, or shared-DB fallback disabled). */
    | 'no_tenant_database'
    /** The `discuss` schema is not installed on this tenant yet. */
    | 'discuss_not_installed'
    /** Anything else: the event was dropped and the cause logged. */
    | 'error'
}

/**
 * Upper bound on how long an event publish may add to the originating request. The pg-meta
 * client's own timeout is 30s, which is far too long to sit in front of a deploy status update.
 */
const PUBLISH_TIMEOUT_MS = 5_000

/** Postgres SQLSTATEs that mean "Discuss isn't installed here", not "something broke". */
const NOT_INSTALLED_SQLSTATES = new Set([
  '3F000', // invalid_schema_name
  '42883', // undefined_function
  '42P01', // undefined_table
])

function isDiscussNotInstalled(error: unknown): boolean {
  if (error instanceof PgMetaDatabaseError && NOT_INSTALLED_SQLSTATES.has(error.code)) {
    return true
  }
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return (
    message.includes('schema "discuss" does not exist') ||
    message.includes('function discuss.publish_event') ||
    message.includes('discuss.publish_event(') ||
    message.includes('relation "discuss.messages" does not exist')
  )
}

class PublishTimeoutError extends Error {
  constructor(ms: number) {
    super(`Discuss event publish exceeded ${ms}ms`)
    this.name = 'PublishTimeoutError'
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new PublishTimeoutError(ms)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

async function callPublishEvent({
  connectionEncrypted,
  eventData,
  eventType,
  projectRef,
}: {
  connectionEncrypted: string
  eventData: unknown
  eventType: string
  projectRef: string
}): Promise<string | null> {
  const result = await executeQuery<{ message_id: string | null }>({
    query: `select discuss.publish_event($1, $2, $3::jsonb)::text as message_id`,
    parameters: [projectRef, eventType, JSON.stringify(eventData ?? {})],
    headers: { 'x-connection-encrypted': connectionEncrypted },
    // No actorId on purpose: this is a service write with no user in context, exactly as in
    // recordAuditLog. Setting app.uid here would imply a member that does not exist.
  })
  if (result.error) throw result.error
  return result.data?.[0]?.message_id ?? null
}

/**
 * Publishes one platform event into a project's Discuss Activity channel.
 *
 * Never throws and never rejects — inspect the returned `reason` if you care. Safe to `await`
 * from inside a mutation: the call is bounded by {@link PUBLISH_TIMEOUT_MS}.
 */
export async function publishDiscussEvent<K extends DiscussEventType>({
  data,
  projectRef,
  type,
}: {
  data: DiscussEventDataMap[K]
  projectRef: string
  type: K
}): Promise<PublishDiscussEventResult> {
  try {
    const ref = projectRef?.trim()
    if (!ref) {
      return { published: false, messageId: null, reason: 'no_tenant_database' }
    }

    const dbUrl = await resolveProjectDatabaseUrl(ref)
    if (!dbUrl?.trim()) {
      // Unprovisioned project, or Model A fallback deliberately disabled. Nothing to publish to.
      return { published: false, messageId: null, reason: 'no_tenant_database' }
    }

    const connectionEncrypted = encryptedConnectionForPgMeta(dbUrl)
    if (!connectionEncrypted) {
      // Fail closed: without a tenant connection we would write into the control-plane database.
      return { published: false, messageId: null, reason: 'no_tenant_database' }
    }

    const messageId = await withTimeout(
      callPublishEvent({
        connectionEncrypted,
        eventData: data,
        eventType: type,
        projectRef: ref,
      }),
      PUBLISH_TIMEOUT_MS
    )

    if (!messageId) {
      // Documented behaviour of discuss.publish_event: the project has never opened Discuss, so
      // there is no Activity channel. Silent by design.
      return { published: false, messageId: null, reason: 'no_activity_channel' }
    }

    return { published: true, messageId, reason: 'published' }
  } catch (error) {
    if (isDiscussNotInstalled(error)) {
      // Tenant predates the Discuss schema, or the migration has not run there yet.
      return { published: false, messageId: null, reason: 'discuss_not_installed' }
    }
    // eslint-disable-next-line no-console
    console.warn('[discuss-events] failed to publish %s for %s: %O', type, projectRef, error)
    return { published: false, messageId: null, reason: 'error' }
  }
}
