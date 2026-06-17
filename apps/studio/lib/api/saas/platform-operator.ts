import type { JwtPayload } from '@indobaseinc/indobase-js'

import { getGotrueUserId, getPrimaryEmail } from './platform'

type Claims = JwtPayload & Record<string, unknown>

function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function isPlatformOperator(claims: Claims | undefined): boolean {
  if (!claims) return false

  const idAllowlist = parseAllowlist(process.env.PLATFORM_OPERATOR_GOTRUE_IDS)
  const emailAllowlist = parseAllowlist(process.env.PLATFORM_OPERATOR_EMAILS).map((e) =>
    e.toLowerCase()
  )

  if (idAllowlist.length === 0 && emailAllowlist.length === 0) {
    return false
  }

  try {
    const gotrueId = getGotrueUserId(claims)
    if (idAllowlist.includes(gotrueId)) return true
  } catch {
    // ignore
  }

  try {
    const email = getPrimaryEmail(claims).toLowerCase()
    if (emailAllowlist.includes(email)) return true
  } catch {
    // ignore
  }

  return false
}

export function assertPlatformOperator(claims: Claims | undefined): void {
  if (!isPlatformOperator(claims)) {
    throw new Error('Forbidden: platform operator access required')
  }
}
