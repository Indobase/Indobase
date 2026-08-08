/**
 * Pure Lane 2 access gates for OS runtime ensure (no DB / provisioner deps).
 */
import { assertFeatureAllowed } from './plan-entitlements'

export type OsEnsureAccessDenial = {
  ok: false
  statusCode: 403
  code: 'account_required' | 'plan_required'
  message: string
}

/** Guest / draft_* — no Lane 2 Enable until real account + workspace. */
export function assertOsAccountForEnsure(input: {
  gotrueId: string
  workspaceRef: string
}): { ok: true } | OsEnsureAccessDenial {
  const gotrueId = input.gotrueId.trim()
  const workspaceRef = input.workspaceRef.trim()

  if (
    !gotrueId ||
    !workspaceRef ||
    gotrueId.startsWith('guest_') ||
    workspaceRef.startsWith('draft_')
  ) {
    return {
      ok: false,
      statusCode: 403,
      code: 'account_required',
      message: 'Create your Indobase account before enabling login, database, or payments.',
    }
  }

  return { ok: true }
}

/**
 * Lane 2 plan/account gate — reject Guest/draft and Free (no backendStudio) before provision.
 */
export function assertOsEnsureAccess(input: {
  gotrueId: string
  workspaceRef: string
  plan: string | null | undefined
}): { ok: true } | OsEnsureAccessDenial {
  const account = assertOsAccountForEnsure({
    gotrueId: input.gotrueId,
    workspaceRef: input.workspaceRef,
  })
  if (!account.ok) return account

  const allowed = assertFeatureAllowed(input.plan || 'free', 'backendStudio')
  if (!allowed.ok) {
    return {
      ok: false,
      statusCode: 403,
      code: 'plan_required',
      message:
        allowed.message ||
        'Upgrade your Indobase plan to Enable login, customer database, or payments on this business.',
    }
  }

  return { ok: true }
}

export function throwOsEnsureDenial(denial: OsEnsureAccessDenial): never {
  const err = new Error(denial.message) as Error & { statusCode?: number; code?: string }
  err.statusCode = denial.statusCode
  err.code = denial.code
  throw err
}
