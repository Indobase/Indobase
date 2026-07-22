import { describe, expect, it } from 'vitest'

import { getPlanEntitlements } from './plan-entitlements'
import { formatBytesLabel, getPlanFeatureLines, getPlanLimits } from './plan-feature-lines'

/**
 * These lock the pricing copy to the entitlements the runtime actually gates on. The bug this
 * guards against really happened: the billing screen advertised "No backend Studio (frontend
 * only)" for Basic while `backendStudio: true` was enforced, and Pro advertised a 2 GB database
 * against an 8 GB entitlement.
 */
describe('pricing copy matches enforced entitlements', () => {
  it('advertises backups only where retention is actually granted', () => {
    // Free/Basic have no backups; the line must not appear.
    for (const plan of ['free', 'basic']) {
      expect(getPlanEntitlements(plan).backupRetentionDays).toBe(0)
      expect(getPlanFeatureLines(plan).join(' | ')).not.toMatch(/backup/i)
    }

    // Paid tiers carry real retention (logical pg_dump backups) and must surface it.
    expect(getPlanEntitlements('pro').backupRetentionDays).toBe(7)
    expect(getPlanFeatureLines('pro', { inheritsFrom: 'basic' })).toContain('7-day backups')
    expect(getPlanEntitlements('studio').backupRetentionDays).toBe(14)
    expect(getPlanFeatureLines('studio', { inheritsFrom: 'pro' })).toContain('14-day backups')
  })

  it('states Studio access per the backendStudio entitlement', () => {
    expect(getPlanFeatureLines('free')).toContain('No Studio (Builder only)')
    expect(getPlanFeatureLines('basic')).toContain('Studio unlocked')

    // Regression: Basic must never be described as frontend-only.
    expect(getPlanFeatureLines('basic').join(' | ')).not.toMatch(/frontend only/i)
  })

  it('renders the database quota that is enforced', () => {
    expect(getPlanFeatureLines('pro')).toContain('8 GB database')
    expect(getPlanFeatureLines('basic')).toContain('1 GB database')
    expect(getPlanFeatureLines('free')).toContain('500 MB database')
  })

  it('never advertises unlimited builds — every tier has a ceiling', () => {
    for (const plan of ['free', 'basic', 'pro', 'studio']) {
      expect(getPlanEntitlements(plan).buildsPerDay).toBeGreaterThan(0)
      expect(getPlanFeatureLines(plan).join(' | ')).not.toMatch(/unlimited builds/i)
    }
  })

  it('reflects the idle-sleep policy, including Pro pinning', () => {
    expect(getPlanFeatureLines('free')).toContain('Sleeps after 7 days idle')
    expect(getPlanFeatureLines('basic')).toContain('Sleeps after 30 days idle')
    expect(getPlanFeatureLines('pro')).toContain('Sleeps after 30 days idle (pin to keep warm)')
    expect(getPlanFeatureLines('studio')).toContain('No idle sleep')
  })

  it('does not repeat perks the parent tier already granted', () => {
    const pro = getPlanFeatureLines('pro', { inheritsFrom: 'basic' })
    expect(pro[0]).toBe('Everything in Basic')
    expect(pro).not.toContain('Custom domain')
    expect(pro).not.toContain('Indobase badge removed')

    // Genuinely new at Pro, so these must still appear.
    expect(pro).toContain('GitHub export')
    expect(pro).toContain('Isolated tenant stack')
  })

  it('derives limits from entitlements rather than hand-written numbers', () => {
    const pro = getPlanEntitlements('pro')
    expect(getPlanLimits('pro')).toMatchObject({
      max_apps: pro.maxApps,
      database_size: pro.databaseBytes,
      storage_size: pro.storageBytes,
      auth_maus: pro.mauLimit,
      builds_per_day: pro.buildsPerDay,
    })
  })

  it('omits null quotas instead of emitting zero', () => {
    const limits = getPlanLimits('enterprise')
    expect(limits.database_size).toBeUndefined()
    expect(limits.max_apps).toBeUndefined()
  })

  it('formats byte labels the way the pricing table reads', () => {
    expect(formatBytesLabel(500 * 1024 ** 2)).toBe('500 MB')
    expect(formatBytesLabel(8 * 1024 ** 3)).toBe('8 GB')
    expect(formatBytesLabel(null)).toBe('Custom')
  })
})
