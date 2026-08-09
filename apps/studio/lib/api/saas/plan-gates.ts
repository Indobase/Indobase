/**
 * Temporary global switch for Indobase plan hard-gates.
 *
 * When disabled (default), signed-in users can use Builder, backend Studio, Lane-2
 * ensure (auth/DB/payments), and Builder/OS prompt meters without upgrading.
 * Org Razorpay billing and plan *display* stay intact — gates off means "treat as allowed."
 *
 * Re-enable later by setting PLAN_GATES_ENABLED_DEFAULT to true, or at runtime:
 * - INDOBASE_PLAN_GATES_ENABLED=true (server)
 * - NEXT_PUBLIC_INDOBASE_PLAN_GATES_ENABLED=true (Studio client + server align on rebuild)
 */

/** Compile-time default — off until billing is ready to enforce again. */
export const PLAN_GATES_ENABLED_DEFAULT = false

function parseEnvBool(value: string | undefined): boolean | null {
  if (value == null) return null
  const v = value.trim().toLowerCase()
  if (!v) return null
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false
  return null
}

/**
 * Whether product hard-gates should enforce plan entitlements.
 * Env overrides the compile-time default when explicitly set.
 */
export function arePlanGatesEnabled(): boolean {
  if (typeof process === 'undefined') {
    return PLAN_GATES_ENABLED_DEFAULT
  }

  // Public flag wins so browser + API stay aligned after a rebuild with env baked in.
  const publicFlag = parseEnvBool(process.env.NEXT_PUBLIC_INDOBASE_PLAN_GATES_ENABLED)
  if (publicFlag != null) return publicFlag

  const serverFlag = parseEnvBool(process.env.INDOBASE_PLAN_GATES_ENABLED)
  if (serverFlag != null) return serverFlag

  return PLAN_GATES_ENABLED_DEFAULT
}

/** Inverse helper used by quotas and UI soft-paths. */
export function arePlanGatesBypassed(): boolean {
  return !arePlanGatesEnabled()
}
