import assert from 'node:assert/strict'
import test from 'node:test'

import type { Session } from './auth.js'
import {
  buildCalendarEmbedConfig,
  calendarFrameOrigins,
  calendarProjectUsername,
  isCalendarConfigured,
} from './calendar.js'

const baseSession: Session = {
  gotrueId: 'user-1',
  email: 'ada.lovelace@example.com',
  projectRef: 'AbCd1234EfGh5678',
  orgSlug: 'acme',
  role: 'developer',
  canEdit: true,
  studioUrl: 'https://studio.indobase.in',
}

test('calendarProjectUsername is stable and sanitized', () => {
  assert.equal(calendarProjectUsername('proj1'), 'ib-cal-proj1')
  assert.equal(calendarProjectUsername('AbCd1234EfGh5678'), 'ib-cal-abcd1234efgh5678')
  assert.equal(calendarProjectUsername('bad user!!'), 'ib-cal-baduser')
  assert.equal(calendarProjectUsername(''), 'ib-cal-unknown')
})

test('buildCalendarEmbedConfig without secrets is not ready', () => {
  const prevUrl = process.env.CALENDAR_PUBLIC_URL
  const prevSecret = process.env.CALENDAR_HANDOFF_SECRET
  delete process.env.CALENDAR_PUBLIC_URL
  delete process.env.CALENDAR_HANDOFF_SECRET

  assert.equal(isCalendarConfigured(), false)
  const cfg = buildCalendarEmbedConfig(baseSession)
  assert.equal(cfg.ready, false)
  assert.equal(cfg.origin, null)
  assert.equal(cfg.launchUrl, null)
  assert.equal(cfg.embedUrl, null)
  assert.equal(cfg.mode, 'unconfigured')
  assert.equal(cfg.sessionAttached, true)
  assert.equal(cfg.productName, 'Indobase Calendar')
  assert.doesNotMatch(JSON.stringify(cfg), /Cal\.com|cal\.diy/i)

  if (prevUrl !== undefined) process.env.CALENDAR_PUBLIC_URL = prevUrl
  if (prevSecret !== undefined) process.env.CALENDAR_HANDOFF_SECRET = prevSecret
})

test('buildCalendarEmbedConfig with host + secret mints SSO launch', () => {
  const prevUrl = process.env.CALENDAR_PUBLIC_URL
  const prevSecret = process.env.CALENDAR_HANDOFF_SECRET
  process.env.CALENDAR_PUBLIC_URL = 'https://calendar.indobase.in'
  process.env.CALENDAR_HANDOFF_SECRET = 'c'.repeat(32)

  assert.equal(isCalendarConfigured(), true)
  const cfg = buildCalendarEmbedConfig(baseSession)
  assert.equal(cfg.ready, true)
  assert.equal(cfg.mode, 'sso')
  assert.equal(cfg.origin, 'https://calendar.indobase.in')
  assert.equal(cfg.bookingUrl, 'https://calendar.indobase.in/ib-cal-abcd1234efgh5678')
  assert.equal(cfg.openUrl, 'https://calendar.indobase.in/events')
  assert.equal(cfg.manageUrl, 'https://calendar.indobase.in/settings')
  assert.ok(cfg.launchUrl?.includes('/sso/launch'))
  assert.ok(cfg.launchUrl?.includes('token='))
  assert.equal(cfg.embedUrl, null)
  assert.ok(calendarFrameOrigins().includes('https://calendar.indobase.in'))

  if (prevUrl !== undefined) process.env.CALENDAR_PUBLIC_URL = prevUrl
  else delete process.env.CALENDAR_PUBLIC_URL
  if (prevSecret !== undefined) process.env.CALENDAR_HANDOFF_SECRET = prevSecret
  else delete process.env.CALENDAR_HANDOFF_SECRET
})
