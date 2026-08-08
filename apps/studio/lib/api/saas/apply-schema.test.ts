import { describe, expect, it } from 'vitest'

import { __applySchemaTest } from './apply-schema'
import { evaluateProductionChecklist, normalizeAppType } from './production-checklist'

const { buildCreateTableSql } = __applySchemaTest

describe('apply-schema builders', () => {
  it('builds safe create table SQL', () => {
    const built = buildCreateTableSql({
      name: 'organizations',
      columns: [
        { name: 'id', type: 'uuid', primary_key: true, default: 'gen_random_uuid()' },
        { name: 'name', type: 'text', required: true },
        { name: 'slug', type: 'text', unique: true, required: true },
      ],
    })
    expect(built.ok).toBe(true)
    if (built.ok) {
      expect(built.sql).toContain('create table if not exists public.organizations')
      expect(built.sql).toContain('slug text not null unique')
    }
  })

  it('rejects unsafe identifiers and types', () => {
    expect(buildCreateTableSql({ name: 'Drop;--', columns: [{ name: 'a', type: 'text' }] }).ok).toBe(
      false
    )
    expect(
      buildCreateTableSql({
        name: 'posts',
        columns: [{ name: 'body', type: 'bytea' }],
      }).ok
    ).toBe(false)
  })
})

describe('production-checklist claim gate', () => {
  it('normalizes app types', () => {
    expect(normalizeAppType('SaaS')).toBe('saas')
    expect(normalizeAppType('shop')).toBe('ecommerce')
    expect(normalizeAppType('appointments')).toBe('booking')
  })

  it('requires login+schema for saas', () => {
    const result = evaluateProductionChecklist({
      app_type: 'saas',
      live_url: 'https://acme.sites.indobase.in',
      checks: {
        live_url: true,
        login_wired: false,
        schema_applied: false,
        seo_basics: true,
        legal_links: true,
      },
    })
    expect(result.claim_production_ready).toBe(false)
    expect(result.missing).toContain('login_wired')
    expect(result.missing).toContain('schema_applied')
  })

  it('passes landing with live+seo+legal', () => {
    const result = evaluateProductionChecklist({
      app_type: 'landing',
      live_url: 'https://brand.sites.indobase.in',
      checks: {
        live_url: true,
        seo_basics: true,
        legal_links: true,
      },
    })
    expect(result.claim_production_ready).toBe(true)
  })

  it('requires checkout for ecommerce', () => {
    const result = evaluateProductionChecklist({
      app_type: 'ecommerce',
      live_url: 'https://shop.sites.indobase.in',
      checks: {
        live_url: true,
        schema_applied: true,
        checkout_wired: false,
        seo_basics: true,
        legal_links: true,
      },
    })
    expect(result.claim_production_ready).toBe(false)
    expect(result.missing).toEqual(['checkout_wired'])
  })
})
