import { describe, expect, it } from 'vitest'

import { evaluateProductionChecklist, normalizeAppType } from './production-checklist'

describe('production-checklist', () => {
  it('normalizes app type aliases', () => {
    expect(normalizeAppType('shop')).toBe('ecommerce')
    expect(normalizeAppType('marketing')).toBe('landing')
    expect(normalizeAppType('b2b')).toBe('saas')
    expect(normalizeAppType('unknown')).toBe('other')
  })

  it('blocks ecommerce claim without checkout + schema', () => {
    const result = evaluateProductionChecklist({
      app_type: 'ecommerce',
      live_url: 'https://meridian.sites.indobase.in',
      checks: {
        live_url: true,
        schema_applied: true,
        seo_basics: true,
        legal_links: true,
        checkout_wired: false,
      },
    })
    expect(result.ok).toBe(true)
    expect(result.claim_production_ready).toBe(false)
    expect(result.missing).toContain('checkout_wired')
  })

  it('allows saas claim when required checks pass', () => {
    const result = evaluateProductionChecklist({
      app_type: 'saas',
      live_url: 'https://acme.sites.indobase.in',
      checks: {
        live_url: true,
        login_wired: true,
        schema_applied: true,
        seo_basics: true,
        legal_links: true,
      },
    })
    expect(result.claim_production_ready).toBe(true)
    expect(result.message).toMatch(/Production ready/)
  })

  it('requires a real live_url string even when flag is true', () => {
    const result = evaluateProductionChecklist({
      app_type: 'landing',
      checks: { live_url: true, seo_basics: true, legal_links: true },
    })
    expect(result.claim_production_ready).toBe(false)
    expect(result.missing).toContain('live_url')
  })

  it('analyzeLiveHtml detects seo and legal markers', async () => {
    const { analyzeLiveHtml, mergeAgentChecksWithServerVerified } = await import(
      './production-checklist'
    )
    const html = `<html><head><title>Acme</title><meta name="description" content="Best app"/></head><body><h1>Acme</h1><a href="/privacy">Privacy</a><a href="/terms">Terms</a><button>Sign in</button></body></html>`
    const parsed = analyzeLiveHtml(html)
    expect(parsed.seo_basics).toBe(true)
    expect(parsed.legal_links).toBe(true)
    expect(parsed.login_wired).toBe(true)
    const merged = mergeAgentChecksWithServerVerified(
      { login_wired: true, schema_applied: true },
      { schema_applied: false },
    )
    expect(merged.schema_applied).toBe(false)
    expect(merged.login_wired).toBe(true)
  })
})
