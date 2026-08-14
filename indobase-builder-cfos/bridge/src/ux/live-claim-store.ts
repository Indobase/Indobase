import type { LiveClaim } from '../../../../packages/platform/src/business/live-claim.ts'
import { loadGen3Record, persistGen3Record } from './gen3-durable.js'

const claims = new Map<string, LiveClaim>()

export function rememberLiveClaim(claim: LiveClaim): LiveClaim {
  claims.set(claim.projectRef, claim)
  persistGen3Record('live-claims', claim.projectRef, claim)
  return claim
}

export function getLiveClaim(projectRef: string): LiveClaim | null {
  const ref = projectRef.trim()
  const cached = claims.get(ref)
  if (cached) return cached
  const disk = loadGen3Record<LiveClaim>('live-claims', ref)
  if (disk) claims.set(ref, disk)
  return disk || null
}
