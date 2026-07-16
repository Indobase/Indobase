import type { GoTrueConfigResponse } from './gotrue-config.defaults'
import { buildDefaultGoTrueConfig } from './gotrue-config.defaults'

/** Auth config keys that map to live GoTrue rate-limit / IP-forwarding env vars. */
export const GOTRUE_RATE_LIMIT_CONFIG_KEYS = [
  'RATE_LIMIT_OTP',
  'RATE_LIMIT_EMAIL_SENT',
  'RATE_LIMIT_SMS_SENT',
  'RATE_LIMIT_VERIFY',
  'RATE_LIMIT_TOKEN_REFRESH',
  'RATE_LIMIT_ANONYMOUS_USERS',
  'RATE_LIMIT_WEB3',
  'SECURITY_SB_FORWARDED_FOR_ENABLED',
] as const

export type GoTrueRateLimitConfigKey = (typeof GOTRUE_RATE_LIMIT_CONFIG_KEYS)[number]

export type GoTrueRateLimitComposeEnv = {
  /** Trusted upstream header used as the per-IP rate-limit key (behind Kong/Traefik). */
  RATE_LIMIT_HEADER: string
  /** Sign-ups / sign-ins per IP per 5 minutes (excludes anonymous). */
  RATE_LIMIT_OTP: string
  RATE_LIMIT_EMAIL_SENT: string
  RATE_LIMIT_SMS_SENT: string
  RATE_LIMIT_VERIFY: string
  RATE_LIMIT_TOKEN_REFRESH: string
  RATE_LIMIT_ANONYMOUS_USERS: string
  /** Omit when unset — GoTrue keeps its built-in default. */
  RATE_LIMIT_WEB3: string | null
  SECURITY_SB_FORWARDED_FOR_ENABLED: string
}

type StoredRateLimits = Partial<Pick<GoTrueConfigResponse, GoTrueRateLimitConfigKey>> | null

function rateLimitNumber(
  stored: StoredRateLimits,
  key: Exclude<GoTrueRateLimitConfigKey, 'SECURITY_SB_FORWARDED_FOR_ENABLED' | 'RATE_LIMIT_WEB3'>,
  fallback: number
): string {
  const value = stored?.[key]
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return String(Math.floor(value))
  }
  return String(fallback)
}

/**
 * Resolve GoTrue env values for per-IP signup/sign-in limits (and related rate limits).
 * Reads dashboard `auth_config` overrides when present; otherwise uses Studio defaults.
 */
export function resolveGoTrueRateLimitComposeEnv(
  stored?: StoredRateLimits
): GoTrueRateLimitComposeEnv {
  const defaults = buildDefaultGoTrueConfig('https://example.local')
  const header =
    process.env.GOTRUE_RATE_LIMIT_HEADER?.trim() ||
    process.env.SAAS_GOTRUE_RATE_LIMIT_HEADER?.trim() ||
    'X-Forwarded-For'

  const web3 = stored?.RATE_LIMIT_WEB3
  const rateLimitWeb3 =
    typeof web3 === 'number' && Number.isFinite(web3) && web3 >= 0
      ? String(Math.floor(web3))
      : null

  const sbForwarded =
    typeof stored?.SECURITY_SB_FORWARDED_FOR_ENABLED === 'boolean'
      ? stored.SECURITY_SB_FORWARDED_FOR_ENABLED
      : Boolean(defaults.SECURITY_SB_FORWARDED_FOR_ENABLED)

  return {
    RATE_LIMIT_HEADER: header,
    RATE_LIMIT_OTP: rateLimitNumber(stored, 'RATE_LIMIT_OTP', defaults.RATE_LIMIT_OTP ?? 30),
    RATE_LIMIT_EMAIL_SENT: rateLimitNumber(
      stored,
      'RATE_LIMIT_EMAIL_SENT',
      defaults.RATE_LIMIT_EMAIL_SENT ?? 2
    ),
    RATE_LIMIT_SMS_SENT: rateLimitNumber(
      stored,
      'RATE_LIMIT_SMS_SENT',
      defaults.RATE_LIMIT_SMS_SENT ?? 30
    ),
    RATE_LIMIT_VERIFY: rateLimitNumber(stored, 'RATE_LIMIT_VERIFY', defaults.RATE_LIMIT_VERIFY ?? 30),
    RATE_LIMIT_TOKEN_REFRESH: rateLimitNumber(
      stored,
      'RATE_LIMIT_TOKEN_REFRESH',
      defaults.RATE_LIMIT_TOKEN_REFRESH ?? 150
    ),
    RATE_LIMIT_ANONYMOUS_USERS: rateLimitNumber(
      stored,
      'RATE_LIMIT_ANONYMOUS_USERS',
      defaults.RATE_LIMIT_ANONYMOUS_USERS ?? 30
    ),
    RATE_LIMIT_WEB3: rateLimitWeb3,
    SECURITY_SB_FORWARDED_FOR_ENABLED: sbForwarded ? 'true' : 'false',
  }
}

/** YAML fragment for tenant/platform auth environment blocks (6-space indent). */
export function formatGoTrueRateLimitComposeYaml(env: GoTrueRateLimitComposeEnv): string {
  const lines = [
    `GOTRUE_RATE_LIMIT_HEADER: "${env.RATE_LIMIT_HEADER}"`,
    `GOTRUE_RATE_LIMIT_OTP: "${env.RATE_LIMIT_OTP}"`,
    `GOTRUE_RATE_LIMIT_EMAIL_SENT: "${env.RATE_LIMIT_EMAIL_SENT}"`,
    `GOTRUE_RATE_LIMIT_SMS_SENT: "${env.RATE_LIMIT_SMS_SENT}"`,
    `GOTRUE_RATE_LIMIT_VERIFY: "${env.RATE_LIMIT_VERIFY}"`,
    `GOTRUE_RATE_LIMIT_TOKEN_REFRESH: "${env.RATE_LIMIT_TOKEN_REFRESH}"`,
    `GOTRUE_RATE_LIMIT_ANONYMOUS_USERS: "${env.RATE_LIMIT_ANONYMOUS_USERS}"`,
  ]
  if (env.RATE_LIMIT_WEB3 != null) {
    lines.push(`GOTRUE_RATE_LIMIT_WEB3: "${env.RATE_LIMIT_WEB3}"`)
  }
  lines.push(`GOTRUE_SECURITY_SB_FORWARDED_FOR_ENABLED: "${env.SECURITY_SB_FORWARDED_FOR_ENABLED}"`)
  return lines.map((line) => `      ${line}`).join('\n')
}

export function authConfigTouchesRateLimits(
  patch: Record<string, unknown> | null | undefined
): boolean {
  if (!patch) return false
  return GOTRUE_RATE_LIMIT_CONFIG_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(patch, key)
  )
}

/**
 * Inject rate-limit env vars on existing tenant-auth compose when missing
 * (fleet repair / stacks provisioned before rate limits were wired).
 */
export function ensureGoTrueRateLimitsInComposeYaml(
  yml: string,
  stored?: StoredRateLimits
): string {
  if (!yml.includes('GOTRUE_') || yml.includes('GOTRUE_RATE_LIMIT_OTP:')) {
    return yml
  }

  const env = resolveGoTrueRateLimitComposeEnv(stored)
  const block = formatGoTrueRateLimitComposeYaml(env)

  if (yml.includes('GOTRUE_SMTP_MAX_FREQUENCY:')) {
    return yml.replace(/^([ \t]*)GOTRUE_SMTP_MAX_FREQUENCY:.*$/m, (match, indent: string) => {
      const indented = block
        .split('\n')
        .map((line) => `${indent}${line.trimStart()}`)
        .join('\n')
      return `${match}\n${indented}`
    })
  }

  if (yml.includes('GOTRUE_EXTERNAL_EMAIL_ENABLED:')) {
    return yml.replace(/^([ \t]*)GOTRUE_EXTERNAL_EMAIL_ENABLED:.*$/m, (match, indent: string) => {
      const indented = block
        .split('\n')
        .map((line) => `${indent}${line.trimStart()}`)
        .join('\n')
      return `${match}\n${indented}`
    })
  }

  return yml
}
