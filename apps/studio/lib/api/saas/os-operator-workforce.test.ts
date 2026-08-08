import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  OPERATOR_JOB_ERROR_SIGNALS,
  OPERATOR_JOB_SEO,
  OPERATOR_JOB_UPTIME,
  createOperatorWorkforce,
  mergeJobSuggestions,
  runErrorSignalsJob,
  runSeoBasicsJob,
  runUptimeCheckJob,
} from './os-operator-workforce'

function htmlResponse(status: number, html: string) {
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

function textResponse(status: number, body = 'ok') {
  return new Response(body, { status, headers: { 'content-type': 'text/plain' } })
}

describe('operator workforce job runners', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('runUptimeCheckJob succeeds when live URL responds', async () => {
    const fetchImpl = vi.fn(async () => textResponse(200))
    const job = await runUptimeCheckJob({
      liveUrl: 'https://biz.example.com',
      fetchImpl: fetchImpl as typeof fetch,
    })
    expect(job.kind).toBe(OPERATOR_JOB_UPTIME)
    expect(job.status).toBe('succeeded')
    expect(job.findings?.ok).toBe(true)
  })

  it('runUptimeCheckJob fails when live URL is down', async () => {
    const fetchImpl = vi.fn(async () => textResponse(503))
    const job = await runUptimeCheckJob({
      liveUrl: 'https://down.example.com',
      fetchImpl: fetchImpl as typeof fetch,
    })
    expect(job.status).toBe('failed')
    expect(job.suggestions?.[0]?.id).toBe('fix_uptime')
    expect(job.summary).not.toMatch(/docker|traefik|provisioner/i)
  })

  it('runSeoBasicsJob records title/meta/robots/sitemap findings and suggestions', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/robots.txt') || url.includes('/sitemap')) return textResponse(404)
      return htmlResponse(
        200,
        '<html><head><title>Cafe</title></head><body>hi</body></html>',
      )
    })

    const job = await runSeoBasicsJob({
      liveUrl: 'https://biz.example.com',
      fetchImpl: fetchImpl as typeof fetch,
    })

    expect(job.kind).toBe(OPERATOR_JOB_SEO)
    expect(job.status).toBe('succeeded')
    expect(job.findings?.title).toBe('Cafe')
    expect(job.findings?.meta_description).toBeNull()
    expect(job.findings?.robots_txt).toBe('missing')
    expect(job.findings?.sitemap_xml).toBe('missing')
    expect(job.suggestions?.map((s) => s.id)).toEqual(
      expect.arrayContaining(['add_meta_description', 'add_robots_txt', 'add_sitemap']),
    )
  })

  it('runErrorSignalsJob is skipped with clear extension point when no provider', async () => {
    const job = await runErrorSignalsJob({
      workspaceRef: 'ws_1',
      liveUrl: 'https://biz.example.com',
    })
    expect(job.kind).toBe(OPERATOR_JOB_ERROR_SIGNALS)
    expect(job.status).toBe('skipped')
    expect(job.findings?.extension_point).toBe('OperatorErrorSignalProvider')
    expect(job.findings?.connected).toBe(false)
  })

  it('runErrorSignalsJob uses injected provider when present', async () => {
    const job = await runErrorSignalsJob({
      workspaceRef: 'ws_1',
      liveUrl: 'https://biz.example.com',
      provider: async () => ({
        status: 'succeeded',
        summary: 'No open error spikes.',
        findings: { provider: 'test', open_issues: 0 },
      }),
    })
    expect(job.status).toBe('succeeded')
    expect(job.findings?.provider).toBe('test')
  })

  it('OperatorWorkforce.runPass executes all three jobs via agent-runtime', async () => {
    const publish = vi.fn()
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/robots.txt')) return textResponse(200, 'User-agent: *')
      if (url.includes('/sitemap.xml')) return textResponse(200, '<urlset/>')
      return htmlResponse(
        200,
        '<html><head><title>Shop</title><meta name="description" content="Buy things"></head></html>',
      )
    })

    const workforce = createOperatorWorkforce({
      fetchImpl: fetchImpl as typeof fetch,
      eventBus: { publish },
    })

    const result = await workforce.runPass({
      workspaceRef: 'ws_ops',
      liveUrl: 'https://ws_ops.indobase.in',
      sessionId: 'ops_ws_ops_1',
    })

    expect(result.runId).toMatch(/^arun_/)
    expect(result.jobs.map((j) => j.kind)).toEqual([
      OPERATOR_JOB_UPTIME,
      OPERATOR_JOB_SEO,
      OPERATOR_JOB_ERROR_SIGNALS,
    ])
    expect(result.jobs.find((j) => j.kind === OPERATOR_JOB_UPTIME)?.status).toBe('succeeded')
    expect(result.jobs.find((j) => j.kind === OPERATOR_JOB_SEO)?.status).toBe('succeeded')
    expect(result.jobs.find((j) => j.kind === OPERATOR_JOB_ERROR_SIGNALS)?.status).toBe('skipped')
    expect(result.lastRunAt).toBeTruthy()
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'OperatorJobsCompleted',
        projectRef: 'ws_ops',
      }),
    )
  })

  it('mergeJobSuggestions dedupes by id', () => {
    const suggestions = mergeJobSuggestions([
      {
        id: 'a',
        kind: OPERATOR_JOB_SEO,
        status: 'succeeded',
        ran_at: '2026-08-07T00:00:00.000Z',
        summary: 'ok',
        suggestions: [
          { id: 'add_sitemap', title: 'Add a sitemap', message: 'Add sitemap.xml' },
          { id: 'add_sitemap', title: 'dup', message: 'dup' },
        ],
      },
    ])
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].id).toBe('add_sitemap')
  })
})
