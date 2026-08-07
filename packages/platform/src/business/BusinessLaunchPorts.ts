/**
 * Optional ports for business.launch stages beyond Publish.
 * Kernel provides no-op stubs; Studio / siblings implement real planners, verify, operators.
 */

export type BusinessLaunchInput = {
  workspaceRef: string
  reason?: string
  /** Optional free-text Launch intent for capability auto-detect. */
  intent?: string
  payload?: Record<string, unknown>
  /**
   * Capabilities to ensure before Publish (e.g. auth, database, payments).
   * Omit → planner may auto-detect. Explicit `[]` = hosting-only Launch.
   */
  requiredCapabilities?: string[]
  /**
   * Hard-gate homepage verify after published Deploy.
   * Default true for artifact publish; Studio softens to false for hosting-only.
   * Override via request / `OS_LAUNCH_STRICT_VERIFY`.
   */
  strictVerify?: boolean
}

/**
 * Plan stage result. When `requiredCapabilities` is omitted on the input,
 * Studio planner should set `plan.requiredCapabilities` (+ customer-safe reasons).
 */
export type BusinessPlanResult =
  | {
      ok: true
      plan?: {
        requiredCapabilities?: string[]
        reasons?: Record<string, string>
        readinessNotes?: string[]
        source?: 'auto' | 'explicit' | string
        [key: string]: unknown
      }
    }
  | { ok: false; message: string }

export interface BusinessPlannerPort {
  plan(input: BusinessLaunchInput): Promise<BusinessPlanResult>
}

export type BusinessEnsureCapabilitiesResult =
  | { ok: true }
  | { ok: false; message: string; capability?: string }

export interface BusinessEnsureCapabilitiesPort {
  ensureCapabilities(input: {
    workspaceRef: string
    capabilities: string[]
    payload?: Record<string, unknown>
  }): Promise<BusinessEnsureCapabilitiesResult>
}

/**
 * Configure after Publish — Studio persists SEO/discovery stubs on auth_config.
 * Phase stub: launcher treats failures as best-effort (site already live).
 */
export type BusinessConfigureResult =
  | { ok: true; details?: Record<string, unknown> }
  | { ok: false; message: string; details?: Record<string, unknown> }

export interface BusinessConfigurePort {
  configure(input: {
    workspaceRef: string
    liveUrl: string
    /** Capabilities ensured for this launch (payments / email / analytics notes). */
    requiredCapabilities?: string[]
    payload?: Record<string, unknown>
  }): Promise<BusinessConfigureResult>
}

/**
 * Verify after Publish — Studio attaches structured check summaries in `details`.
 * Hard failures (`ok: false`) fail Launch / skip MarkBusinessLive claim.
 * Soft warnings stay `ok: true` with `details.warnings`.
 *
 * Rollback policy: hosting from execution.publish is not torn down; Studio stamps
 * `os_publish.publish_status = verify_failed` instead.
 */
export type BusinessVerifyResult =
  | { ok: true; details?: Record<string, unknown> }
  | { ok: false; message: string; details?: Record<string, unknown> }

export interface BusinessVerifyPort {
  verify(input: {
    workspaceRef: string
    liveUrl: string
    /** Capabilities ensured for this launch (e.g. auth → deferred login smoke). */
    requiredCapabilities?: string[]
    /** When true, homepage unreachable fails Launch. */
    strictVerify?: boolean
    payload?: Record<string, unknown>
  }): Promise<BusinessVerifyResult>
}

/**
 * AI Operator after Verify — Studio workforce records monitoring session + job results.
 * Soft-fail: launcher treats failures as best-effort (site already live).
 */
export type BusinessOperatorResult =
  | { ok: true; details?: Record<string, unknown> }
  | { ok: false; message: string; details?: Record<string, unknown> }

export interface BusinessOperatorPort {
  startOperator(input: {
    workspaceRef: string
    liveUrl: string
    requiredCapabilities?: string[]
    payload?: Record<string, unknown>
  }): Promise<BusinessOperatorResult>
}

/** Default no-op ports — siblings replace without breaking Launch. */
export function createNoopBusinessLaunchPorts(): {
  planner: BusinessPlannerPort
  ensureCapabilities: BusinessEnsureCapabilitiesPort
  configure: BusinessConfigurePort
  verify: BusinessVerifyPort
  operator: BusinessOperatorPort
} {
  return {
    planner: {
      async plan() {
        return { ok: true }
      },
    },
    ensureCapabilities: {
      async ensureCapabilities() {
        return { ok: true }
      },
    },
    configure: {
      async configure() {
        return { ok: true }
      },
    },
    verify: {
      async verify() {
        return { ok: true }
      },
    },
    operator: {
      async startOperator() {
        return { ok: true }
      },
    },
  }
}
