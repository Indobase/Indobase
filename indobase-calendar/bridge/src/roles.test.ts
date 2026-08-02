import assert from 'node:assert/strict'
import test from 'node:test'

import { calendarRoleFromStudio } from './roles.js'
import { buildCalendarSpaceMap, calendarOrgKey, calendarProjectUsername } from './space-map.js'
import { rewriteProductPath, canonicalProductPath } from './routes.js'
import { buildMeetAttach, defaultMeetLinkForProject, meetMeetingIdForEvent } from './meet-attach.js'
import { brandCalendarHtml, shouldBrandCalendarResponse } from './brand-html.js'
import { createSessionToken, readSessionToken, verifyStudioHandoff, AUDIENCE } from './auth.js'
import { createHmac } from 'node:crypto'

const SECRET = 'a'.repeat(32)

function mintHandoff(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    aud: AUDIENCE,
    sub: 'user-1',
    email: 'ada@example.com',
    project_ref: 'AbCd1234EfGh5678',
    organization_slug: 'acme',
    organization_name: 'Acme',
    project_name: 'Demo',
    role: 'developer',
    studio_url: 'https://studio.indobase.in',
    iat: now,
    exp: now + 300,
    ...overrides,
  }
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

test('role map Owner/Admin/Member/Readonly', () => {
  assert.equal(calendarRoleFromStudio('owner').calendarRole, 'Owner')
  assert.equal(calendarRoleFromStudio('admin').calendarRole, 'Admin')
  assert.equal(calendarRoleFromStudio('developer').calendarRole, 'Member')
  assert.equal(calendarRoleFromStudio('viewer').calendarRole, 'Readonly')
  assert.equal(calendarRoleFromStudio('viewer').canEdit, false)
})

test('space map keys are stable', () => {
  assert.equal(calendarOrgKey('Acme Corp!'), 'ib-cal-org-acmecorp')
  assert.equal(calendarProjectUsername('AbCd1234EfGh5678'), 'ib-cal-abcd1234efgh5678')
  const map = buildCalendarSpaceMap({
    orgSlug: 'acme',
    projectRef: 'proj1',
    projectName: 'Project One',
    organizationName: 'Acme',
  })
  assert.equal(map.projectUsername, 'ib-cal-proj1')
  assert.equal(map.orgKey, 'ib-cal-org-acme')
})

test('product path aliases', () => {
  assert.equal(rewriteProductPath('/events'), '/event-types')
  assert.equal(rewriteProductPath('/team'), '/teams')
  assert.equal(rewriteProductPath('/settings'), '/settings/my-account')
  assert.equal(canonicalProductPath('/event-types'), '/events')
  assert.equal(canonicalProductPath('/teams'), '/team')
})

test('meet attach links stable project + event rooms', () => {
  const stub = buildMeetAttach({ projectRef: 'AbCd1234' })
  assert.match(stub.meetLink, /meet\.indobase\.in\/meeting\/ib-meet-proj-abcd1234/)
  assert.equal(stub.meetingId, 'ib-meet-proj-abcd1234')
  assert.equal(stub.mode, 'linked')
  assert.equal(defaultMeetLinkForProject('x'), 'https://meet.indobase.in/meeting/ib-meet-proj-x')
  const evt = buildMeetAttach({ projectRef: 'AbCd1234', eventKey: 'Demo Call!' })
  assert.equal(evt.scope, 'event')
  assert.equal(evt.meetingId, meetMeetingIdForEvent('AbCd1234', 'Demo Call!'))
  assert.match(evt.meetingId, /^ib-meet-evt-abcd1234-demo-call$/)
  assert.doesNotMatch(JSON.stringify(stub), /Jitsi|Cal\.com|cal\.diy/i)
})

test('brand html strips engine chrome strings in title path', () => {
  assert.equal(shouldBrandCalendarResponse('text/html; charset=utf-8'), true)
  assert.equal(shouldBrandCalendarResponse('application/json'), false)
  const html = brandCalendarHtml(
    '<html><head><title>Cal.com</title></head><body>Hello</body></html>'
  )
  assert.match(html, /<title>Indobase Calendar<\/title>/)
  assert.match(html, /indobase-favicon/)
  assert.doesNotMatch(html, /<title>Cal\.com<\/title>/)
})

test('verify studio handoff + session roundtrip', () => {
  const token = mintHandoff()
  const claims = verifyStudioHandoff(token, SECRET)
  assert.ok(claims)
  assert.equal(claims!.aud, AUDIENCE)
  assert.equal(claims!.email, 'ada@example.com')

  const sessionTok = createSessionToken(claims!, SECRET)
  const session = readSessionToken(sessionTok, SECRET)
  assert.ok(session)
  assert.equal(session!.calendarRole, 'Member')
  assert.equal(session!.projectRef, 'AbCd1234EfGh5678')
})

test('rejects wrong audience', () => {
  const token = mintHandoff({ aud: 'indobase-discuss' })
  assert.equal(verifyStudioHandoff(token, SECRET), null)
})
