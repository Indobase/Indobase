/**
 * Headless Platform API — OS-facing route paths and types.
 * Indobase OS bridge calls these; customers never see Studio.
 */
export const PLATFORM_API_PREFIX = '/api/os/v1' as const

export const OS_API_SECRET_HEADER = 'x-indobase-os-secret' as const

export const PlatformApiRoutes = {
  identityOtpStart: `${PLATFORM_API_PREFIX}/identity/otp/start`,
  identityOtpVerify: `${PLATFORM_API_PREFIX}/identity/otp/verify`,
  workspace: (ref: string) => `${PLATFORM_API_PREFIX}/workspace/${encodeURIComponent(ref)}`,
  runtimeEnsure: `${PLATFORM_API_PREFIX}/runtime/ensure`,
  deployPublish: `${PLATFORM_API_PREFIX}/deploy/publish`,
  /** GET/POST — OS agent usage shares Builder free-prompt meter */
  promptQuota: `${PLATFORM_API_PREFIX}/usage/prompt-quota`,
  /** GET/POST — product Auth OTP From (branded login mail) */
  authMail: `${PLATFORM_API_PREFIX}/auth/mail`,
} as const

export type OsAuthMailStatus = {
  ok: boolean
  mode: 'indobase' | 'branded'
  from_email: string
  from_name: string
  branded: boolean
  default_from_email: string
  default_from_name: string
  message?: string
  code?: string
}

export type OsEnsureNextStep = {
  id: string
  label: string
  path?: string
}

export type OsPromptQuota = {
  plan: string
  used: number
  limit: number | null
  remaining: number | null
  isFree: boolean
  organization_slug: string
  upgradeUrl: string
}

export type OsPromptQuotaResponse = {
  ok: boolean
  quota?: OsPromptQuota
  code?: string
  message?: string
}

export type OsWorkspaceSession = {
  gotrue_id: string
  email: string
  workspace_ref: string
  organization_slug: string
  workspace_name: string
  provision_state: 'none' | 'provisioning' | 'ready'
  backend?: {
    anon_key: string
    api_url: string
    auth_url: string
    project_name: string
    project_ref: string
    project_url: string
    rest_url: string
    storage_url: string
  } | null
}

export type RuntimeEnsureRequest = {
  workspace_ref: string
  capability: string
  hints?: Record<string, unknown>
}

export type RuntimeEnsureResponse = {
  ok: boolean
  capability: string
  capabilityId?: string
  customer_label?: string
  /** enabled | enabling | failed | unsupported */
  status?: string
  provision_state: string
  backend?: OsWorkspaceSession['backend']
  /** Customer Enable copy — never provider names */
  message?: string
  /** Product handoff when ensure left setup unfinished (commerce/email) */
  launch_url?: string | null
  /** pending = backend ready, finish product setup; ready = fully live */
  setup_status?: 'pending' | 'ready'
  /** Soft follow-ups (e.g. brand login From after Login enabled) */
  next_steps?: OsEnsureNextStep[]
}

export type DeployPublishRequest = {
  workspace_ref: string
  reason?: string
}

export type DeployPublishResponse = {
  ok: boolean
  url?: string
  status: 'queued' | 'published' | 'failed'
  message?: string
}
