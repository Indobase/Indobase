import { Pool } from 'pg'

/**
 * Mark a Studio-provisioned Calendar user as email-verified.
 *
 * The bridge creates users through the scheduling engine's ordinary signup endpoint, which is the
 * same path a stranger off the internet takes — so the account lands with `emailVerified = null`
 * and the engine parks the user on a "Check your email" screen they can never clear, because no
 * verification mail is ever sent for SSO users.
 *
 * These users did not come off the internet. They arrived on a verified Studio session, and Studio
 * is the identity authority for the whole ecosystem — it already verified the address. Recording
 * that fact here is not a security shortcut; it is propagating a verification that already happened
 * upstream. The engine has no API for it, so it is a direct column update.
 *
 * `completedOnboarding` is set for the same reason: onboarding collects details Studio already
 * holds, and leaving it false drops the user into a wizard on every launch.
 */

let pool: Pool | null = null

function getPool(): Pool | null {
  const url = (process.env.CALENDAR_DATABASE_URL || process.env.DATABASE_URL || '').trim()
  if (!url) return null

  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 2,
      // The bridge only ever runs two tiny statements; never let a hung DB stall a launch.
      connectionTimeoutMillis: 4000,
      idleTimeoutMillis: 10_000,
    })
    pool.on('error', (err) => {
      console.error('[calendar] verify-user pool error:', err)
    })
  }
  return pool
}

/**
 * Best-effort. Returns true only when a row was actually updated.
 *
 * Never throws: a failure here must not block the handoff. A user who reaches Calendar with an
 * unverified flag sees a nag screen; a user whose launch throws sees nothing at all. The first is
 * recoverable, the second is not.
 */
export async function markCalendarUserVerified(email: string): Promise<boolean> {
  const normalised = email.trim().toLowerCase()
  if (!normalised) return false

  const p = getPool()
  if (!p) {
    console.warn(
      '[calendar] CALENDAR_DATABASE_URL not set — cannot mark SSO user verified; ' +
        'the engine will show its email-verification screen'
    )
    return false
  }

  try {
    /*
     * Only touch rows that are still unverified, so a user who verified by some other route is
     * never rewritten and the statement stays idempotent across repeated launches.
     */
    const res = await p.query(
      `update "users"
          set "emailVerified" = now(),
              "completedOnboarding" = true
        where lower("email") = $1
          and "emailVerified" is null`,
      [normalised]
    )
    return (res.rowCount ?? 0) > 0
  } catch (err) {
    console.error('[calendar] failed to mark user verified:', err)
    return false
  }
}
