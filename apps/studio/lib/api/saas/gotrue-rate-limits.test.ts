import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  authConfigTouchesRateLimits,
  ensureGoTrueRateLimitsInComposeYaml,
  formatGoTrueRateLimitComposeYaml,
  resolveGoTrueRateLimitComposeEnv,
} from './gotrue-rate-limits'

describe('resolveGoTrueRateLimitComposeEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses Studio defaults for email signup IP limits', () => {
    const env = resolveGoTrueRateLimitComposeEnv()
    expect(env.RATE_LIMIT_HEADER).toBe('X-Forwarded-For')
    expect(env.RATE_LIMIT_OTP).toBe('30')
    expect(env.RATE_LIMIT_EMAIL_SENT).toBe('2')
    expect(env.RATE_LIMIT_VERIFY).toBe('30')
    expect(env.RATE_LIMIT_TOKEN_REFRESH).toBe('150')
    expect(env.RATE_LIMIT_WEB3).toBeNull()
    expect(env.SECURITY_SB_FORWARDED_FOR_ENABLED).toBe('false')
  })

  it('honors auth_config overrides for RATE_LIMIT_OTP', () => {
    const env = resolveGoTrueRateLimitComposeEnv({ RATE_LIMIT_OTP: 5, RATE_LIMIT_WEB3: 12 })
    expect(env.RATE_LIMIT_OTP).toBe('5')
    expect(env.RATE_LIMIT_WEB3).toBe('12')
  })

  it('allows GOTRUE_RATE_LIMIT_HEADER override via env', () => {
    vi.stubEnv('GOTRUE_RATE_LIMIT_HEADER', 'CF-Connecting-IP')
    expect(resolveGoTrueRateLimitComposeEnv().RATE_LIMIT_HEADER).toBe('CF-Connecting-IP')
  })
})

describe('authConfigTouchesRateLimits', () => {
  it('detects signup IP rate-limit patches', () => {
    expect(authConfigTouchesRateLimits({ RATE_LIMIT_OTP: 10 })).toBe(true)
    expect(authConfigTouchesRateLimits({ DISABLE_SIGNUP: true })).toBe(false)
  })
})

describe('ensureGoTrueRateLimitsInComposeYaml', () => {
  it('injects rate-limit block after SMTP_MAX_FREQUENCY when missing', () => {
    const input = `
  tenant-auth:
    environment:
      GOTRUE_EXTERNAL_EMAIL_ENABLED: "true"
      GOTRUE_SMTP_MAX_FREQUENCY: "60s"
      GOTRUE_SMTP_HOST: smtp.example.com
`
    const out = ensureGoTrueRateLimitsInComposeYaml(input)
    expect(out).toContain('GOTRUE_RATE_LIMIT_OTP: "30"')
    expect(out).toContain('GOTRUE_RATE_LIMIT_HEADER: "X-Forwarded-For"')
    expect(out.indexOf('GOTRUE_SMTP_MAX_FREQUENCY')).toBeLessThan(out.indexOf('GOTRUE_RATE_LIMIT_OTP'))
  })

  it('is idempotent when RATE_LIMIT_OTP already present', () => {
    const input = `
      GOTRUE_RATE_LIMIT_OTP: "15"
      GOTRUE_SMTP_MAX_FREQUENCY: "60s"
`
    expect(ensureGoTrueRateLimitsInComposeYaml(input)).toBe(input)
  })
})

describe('formatGoTrueRateLimitComposeYaml', () => {
  it('omits WEB3 when null', () => {
    const yaml = formatGoTrueRateLimitComposeYaml(resolveGoTrueRateLimitComposeEnv())
    expect(yaml).toContain('GOTRUE_RATE_LIMIT_OTP')
    expect(yaml).not.toContain('GOTRUE_RATE_LIMIT_WEB3')
  })
})
