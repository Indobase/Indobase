/**
 * Single source of the customer-facing feature bullets for each plan.
 *
 * These are DERIVED from `plan-entitlements.ts` — the same object the runtime gates on — so a
 * pricing surface can never advertise something the code does not enforce. The Studio billing
 * screen and the marketing site had drifted into three different stories about Basic (one said
 * "no backend Studio" while `backendStudio: true` was enforced); deriving both from here is what
 * stops that recurring.
 *
 * Rule: never hand-write a bullet describing a quota. Add the field to PlanEntitlements and
 * render it here.
 */
import { getPlanEntitlements, type PlanEntitlements } from './plan-entitlements'

const GB = 1024 ** 3
const MB = 1024 ** 2

/** Bytes → a short human label ("500 MB", "8 GB"). */
export function formatBytesLabel(bytes: number | null): string {
  if (bytes === null) return 'Custom'
  if (bytes >= GB) {
    const gb = bytes / GB
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`
  }
  return `${Math.round(bytes / MB)} MB`
}

function formatCount(n: number | null, suffix: string): string {
  if (n === null) return `Custom ${suffix}`
  if (n >= 1000) {
    const k = n / 1000
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k ${suffix}`
  }
  return `${n} ${suffix}`
}

function idleSleepLine(e: PlanEntitlements): string {
  if (e.idleSleepDays === null) return 'No idle sleep'

  const base = `Sleeps after ${e.idleSleepDays} days idle`
  return e.canPinProject ? `${base} (pin to keep warm)` : base
}

function supportLine(tier: PlanEntitlements['supportTier']): string {
  if (tier === 'community') return 'Community support'
  if (tier === 'email-48h') return 'Email support (48h)'
  return 'Priority support'
}

/**
 * Ordered feature bullets for a plan's pricing card.
 *
 * `inheritsFrom` takes a PLAN ID. Quotas are always rendered (they change at every tier), but
 * boolean perks are diffed against the parent so an "Everything in Basic" card does not go on to
 * repeat the perks Basic already had.
 */
export function getPlanFeatureLines(plan: string, opts?: { inheritsFrom?: string }): string[] {
  const e = getPlanEntitlements(plan)
  const parent = opts?.inheritsFrom ? getPlanEntitlements(opts.inheritsFrom) : null
  const lines: string[] = []

  /** Render a boolean perk only when this plan gains it relative to the parent. */
  const gained = (pick: (x: PlanEntitlements) => boolean) => pick(e) && !(parent && pick(parent))

  if (parent) {
    lines.push(`Everything in ${parent.displayName}`)
  } else {
    lines.push(e.backendStudio ? 'Studio unlocked' : 'No Studio (Builder only)')

    if (e.backendStudio) {
      lines.push('Auth, Database, Storage, Functions')
    }
  }

  lines.push(e.maxApps === null ? 'Unlimited apps' : `${e.maxApps} app${e.maxApps === 1 ? '' : 's'}`)

  if (e.maxSeats !== null && e.maxSeats > 1) {
    lines.push(`${e.maxSeats} seats`)
  }

  lines.push(e.buildsPerDay === null ? 'Fair-use builds' : `~${e.buildsPerDay} AI builds/day`)
  if (e.videoAiLimit === null) {
    lines.push('Unlimited Video AI credits')
  } else {
    lines.push(`${e.videoAiLimit} Video AI credits`)
  }
  lines.push(`${formatBytesLabel(e.databaseBytes)} database`)
  lines.push(`${formatBytesLabel(e.storageBytes)} file storage`)
  lines.push(formatCount(e.mauLimit, 'MAU'))
  lines.push(`${formatBytesLabel(e.egressBytes)} egress`)

  if (gained((x) => x.customDomain)) lines.push('Custom domain')
  if (gained((x) => !x.showIndobaseBadge)) lines.push('Indobase badge removed')

  // Idle policy is worth restating whenever it actually differs from the parent.
  if (!parent || parent.idleSleepDays !== e.idleSleepDays || parent.canPinProject !== e.canPinProject) {
    lines.push(idleSleepLine(e))
  }

  if (gained((x) => x.githubExport)) lines.push('GitHub export')
  if (gained((x) => x.isolatedStack)) lines.push('Isolated tenant stack')
  if (gained((x) => x.priorityBuildQueue)) lines.push('Priority build queue')
  if (gained((x) => x.sharedBilling)) lines.push('Shared billing')

  /*
   * Backups are intentionally NOT rendered while retention is 0. There is no backup
   * implementation yet; advertising one would promise recovery we cannot perform.
   */
  if (e.backupRetentionDays > 0) {
    lines.push(`${e.backupRetentionDays}-day backups`)
  }

  if (!parent || parent.supportTier !== e.supportTier) {
    lines.push(supportLine(e.supportTier))
  }

  return lines
}

/**
 * Machine-readable quota map for a plan's pricing payload, derived from the same entitlements the
 * runtime gates on. Previously these were hand-written per plan and had drifted (Pro advertised a
 * 2 GB database against an 8 GB entitlement). Null quotas are omitted rather than sent as 0.
 */
export function getPlanLimits(plan: string): Record<string, number> {
  const e = getPlanEntitlements(plan)
  const limits: Record<string, number> = {}

  if (e.maxApps !== null) limits.max_apps = e.maxApps
  if (e.maxSeats !== null) limits.max_seats = e.maxSeats
  if (e.buildsPerDay !== null) limits.builds_per_day = e.buildsPerDay
  if (e.databaseBytes !== null) limits.database_size = e.databaseBytes
  if (e.storageBytes !== null) limits.storage_size = e.storageBytes
  if (e.mauLimit !== null) limits.auth_maus = e.mauLimit
  if (e.egressBytes !== null) limits.egress_bytes = e.egressBytes

  return limits
}
