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
})
