import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  resolveStrictVerify,
  summarizeOsLaunchVerify,
  verifyOsLaunch,
} from './os-launch-verify'

function jsonResponse(status: number, body = 'ok') {
  return new Response(body, { status, headers: { 'content-type': 'text/plain' } })
}

describe('verifyOsLaunch', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('passes when homepage is 200 and optional paths are missing (soft warn)', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/') || url.match(/https:\/\/biz\.example\.com\/?$/)) {
        return jsonResponse(200, '<html>hi</html>')
      }
      return jsonResponse(404)
    })

    const result = await verifyOsLaunch({
      liveUrl: 'https://biz.example.com/',
      fetchImpl: fetchImpl as typeof fetch,
    })

    expect(result.passed).toBe(true)
    expect(result.strictVerify).toBe(true)
    expect(result.failures).toEqual([])
    expect(result.checks.find((c) => c.id === 'homepage')?.status).toBe('passed')
    expect(result.checks.find((c) => c.id === 'homepage')?.severity).toBe('hard')
    expect(result.checks.find((c) => c.id === 'robots')?.status).toBe('skipped')
    expect(result.checks.find((c) => c.id === 'robots')?.severity).toBe('soft')
    expect(result.checks.find((c) => c.id === 'sitemap')?.status).toBe('skipped')
    expect(result.checks.find((c) => c.id === 'health_endpoint')?.status).toBe('skipped')
    expect(result.checks.find((c) => c.id === 'auth_login_smoke')?.status).toBe('skipped')
    expect(result.warnings.map((w) => w.id)).toEqual(
      expect.arrayContaining(['robots', 'sitemap', 'health_endpoint', 'auth_login_smoke']),
    )
  })

  it('passes optional robots/sitemap/health when present', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/robots.txt')) return jsonResponse(200, 'User-agent: *')
      if (url.includes('/sitemap.xml')) return jsonResponse(200, '<urlset/>')
      if (url.includes('/api/health')) return jsonResponse(200, '{"ok":true}')
      return jsonResponse(200, '<html/>')
    })

    const result = await verifyOsLaunch({
      liveUrl: 'https://biz.example.com',
      fetchImpl: fetchImpl as typeof fetch,
    })

    expect(result.passed).toBe(true)
    expect(result.checks.find((c) => c.id === 'robots')?.status).toBe('passed')
    expect(result.checks.find((c) => c.id === 'sitemap')?.status).toBe('passed')
    expect(result.checks.find((c) => c.id === 'health_endpoint')?.status).toBe('passed')
    expect(result.checks.find((c) => c.id === 'health_endpoint')?.details?.path).toBe('/api/health')
  })

  it('hard-fails when homepage is unreachable under strictVerify', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(503))

    const result = await verifyOsLaunch({
      liveUrl: 'https://down.example.com',
      strictVerify: true,
      fetchImpl: fetchImpl as typeof fetch,
    })

    expect(result.passed).toBe(false)
    expect(result.failures.map((f) => f.id)).toContain('homepage')
    expect(result.failures[0]?.severity).toBe('hard')
    expect(result.failures[0]?.message).not.toMatch(/docker|traefik|provisioner/i)
  })

  it('hosting-only skip: homepage unreachable is soft when strictVerify=false', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(404))

    const result = await verifyOsLaunch({
      liveUrl: 'https://empty.example.com',
      strictVerify: false,
      fetchImpl: fetchImpl as typeof fetch,
    })

    expect(result.passed).toBe(true)
    expect(result.failures).toEqual([])
    const home = result.checks.find((c) => c.id === 'homepage')
    expect(home?.status).toBe('skipped')
    expect(home?.severity).toBe('soft')
    expect(result.warnings.map((w) => w.id)).toContain('homepage')
  })

  it('soft-warns when robots.txt exists but errors — does not fail passed', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/robots.txt')) return jsonResponse(500)
      if (url.includes('/sitemap') || url.includes('/health') || url.includes('/api/health')) {
        return jsonResponse(404)
      }
      return jsonResponse(200)
    })

    const result = await verifyOsLaunch({
      liveUrl: 'https://biz.example.com',
      fetchImpl: fetchImpl as typeof fetch,
    })

    expect(result.passed).toBe(true)
    expect(result.failures).toEqual([])
    const robots = result.checks.find((c) => c.id === 'robots')
    expect(robots?.status).toBe('failed')
    expect(robots?.severity).toBe('soft')
    expect(result.warnings.map((w) => w.id)).toContain('robots')
  })

  it('defers auth login smoke when auth was ensured (soft)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200))

    const result = await verifyOsLaunch({
      liveUrl: 'https://biz.example.com',
      ensuredCapabilities: ['auth'],
      fetchImpl: fetchImpl as typeof fetch,
    })

    const auth = result.checks.find((c) => c.id === 'auth_login_smoke')
    expect(auth?.status).toBe('deferred')
    expect(auth?.severity).toBe('soft')
    expect(auth?.message).toMatch(/deferred/i)
    expect(result.passed).toBe(true)
  })

  it('summarizeOsLaunchVerify includes hard/soft and is customer-safe', () => {
    const summary = summarizeOsLaunchVerify({
      passed: false,
      strictVerify: true,
      verifiedAt: '2026-08-07T00:00:00.000Z',
      liveUrl: 'https://biz.example.com',
      checks: [
        {
          id: 'homepage',
          label: 'Homepage',
          status: 'failed',
          severity: 'hard',
          message: "We couldn't confirm your homepage is responding yet. Please try again in a moment.",
        },
      ],
      failures: [
        {
          id: 'homepage',
          label: 'Homepage',
          status: 'failed',
          severity: 'hard',
          message: "We couldn't confirm your homepage is responding yet. Please try again in a moment.",
        },
      ],
      warnings: [],
    })

    expect(summary).toEqual({
      passed: false,
      strict_verify: true,
      verified_at: '2026-08-07T00:00:00.000Z',
      live_url: 'https://biz.example.com',
      check_ids: [{ id: 'homepage', status: 'failed', severity: 'hard' }],
      failure_ids: ['homepage'],
      failure_messages: [
        "We couldn't confirm your homepage is responding yet. Please try again in a moment.",
      ],
      warning_ids: [],
      warning_messages: [],
    })
  })
})

describe('resolveStrictVerify', () => {
  it('defaults true for artifact / unknown', () => {
    expect(resolveStrictVerify({})).toBe(true)
    expect(resolveStrictVerify({ publishKind: 'artifact' })).toBe(true)
  })

  it('defaults false for hosting-only', () => {
    expect(resolveStrictVerify({ publishKind: 'hosting-only' })).toBe(false)
  })

  it('explicit and env override kind', () => {
    expect(resolveStrictVerify({ explicit: true, publishKind: 'hosting-only' })).toBe(true)
    expect(resolveStrictVerify({ explicit: false, publishKind: 'artifact' })).toBe(false)
    expect(resolveStrictVerify({ publishKind: 'artifact', envValue: 'false' })).toBe(false)
    expect(resolveStrictVerify({ publishKind: 'hosting-only', envValue: 'true' })).toBe(true)
  })
})
