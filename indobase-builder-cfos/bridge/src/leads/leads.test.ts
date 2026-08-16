import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, it } from 'node:test'
import { Hono } from 'hono'

import { emptyBusinessRuntimeState } from '@indobase/platform'

import type { Session } from '../auth.ts'
import { getBlueprint, isOpenWriteRule, rulesForProfile } from '../pocketbase/blueprints.ts'
import { buildSessionApiPayload } from '../session-payload.ts'
import { clearBusinessSpecsForTests, inferBusinessSpec, rememberBusinessSpec } from '../ux/business-spec.ts'
import { composePresentation, readWorkspaceScreenFromSearch, workspaceLeadsInboxUrl, workspaceOrdersInboxUrl, type RuntimeView } from '../ux/presentation.ts'
import { injectLeadsRuntimeIntoHtml, landingHasLeadsAbi } from '../ux/preview-artifact.ts'
import { landingFormIsDead } from '../wire-proof.ts'
import { handleLeadStatusUpdate, handleLeadSubmit, handleLeadsList, handleLeadsOptions } from './http.ts'
import { composeLeadNotifyMessage, notifyOwnerOfLead } from './notify.ts'
import {
  clearLeadRateLimitForTests,
  normalizeLead,
  normalizeLeadStatus,
  rateLimitLead,
  sanitizeLeadId,
} from './service.ts'

const ENGINE_WORDS = /PocketBase|admin token|ib_[a-z0-9]+_|collections\/|ECONNREFUSED|undefined|stack/i

function leadsApp() {
  const app = new Hono()
  app.options('/api/os/leads', handleLeadsOptions)
  app.post('/api/os/leads', handleLeadSubmit)
  return app
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return leadsApp().request('/api/os/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('landing enquiries', () => {
  beforeEach(() => {
    clearLeadRateLimitForTests()
  })

  it('keeps a name plus one way to reply, and says which is missing', () => {
    assert.equal(normalizeLead({ name: 'A', email: 'a@b.co' }).ok, false)
    const noContact = normalizeLead({ name: 'Asha Menon' })
    assert.equal(noContact.ok, false)
    assert.match(noContact.ok === false ? noContact.message : '', /email or phone/i)

    const badEmail = normalizeLead({ name: 'Asha Menon', email: 'asha@' })
    assert.equal(badEmail.ok, false)
    assert.match(badEmail.ok === false ? badEmail.message : '', /email/i)

    const byPhone = normalizeLead({ name: 'Asha Menon', phone: '+91 98765 43210' })
    assert.equal(byPhone.ok, true)
    if (byPhone.ok) assert.equal(byPhone.lead.source, 'website')
  })

  it('strips control characters and caps field length', () => {
    const long = 'x'.repeat(5000)
    const result = normalizeLead({ name: 'Asha\u0007 Menon', email: 'a@b.co', message: long })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.doesNotMatch(result.lead.name, /[\u0000-\u001f]/)
    assert.ok(result.lead.message.length <= 2000)
  })

  it('rate limits one visitor without blocking the next project', () => {
    for (let i = 0; i < 5; i += 1) {
      assert.equal(rateLimitLead('proj_a:1.2.3.4').allowed, true)
    }
    assert.equal(rateLimitLead('proj_a:1.2.3.4').allowed, false)
    assert.equal(rateLimitLead('proj_b:1.2.3.4').allowed, true)
    assert.equal(rateLimitLead('proj_a:5.6.7.8').allowed, true)
  })

  it('leads collection is admin-only so the browser cannot read or spam it', () => {
    const blueprint = getBlueprint('landing')
    const leads = blueprint.collections.find((c) => c.name === 'leads')
    assert.ok(leads)
    const rules = rulesForProfile(leads.rules)
    assert.equal(isOpenWriteRule(rules.createRule), false)
    assert.equal(rules.listRule, null)
  })

  it('injects an absolute enquiry ABI once, bound to the project', () => {
    process.env.INDOBASE_BRIDGE_PUBLIC_URL = 'https://builder.indobase.in'
    const html = '<html><head></head><body><h1>Studio</h1></body></html>'
    const once = injectLeadsRuntimeIntoHtml(html, 'proj_lead_1')
    assert.equal(landingHasLeadsAbi(once), true)
    assert.match(once, /https:\/\/builder\.indobase\.in\/api\/os\/leads/)
    assert.match(once, /var ref="[a-z0-9]+"/)
    assert.doesNotMatch(once, /"\/api\/os\/leads"/)
    assert.equal(injectLeadsRuntimeIntoHtml(once, 'proj_lead_1'), once)
  })

  it('answers CORS preflight so a published site on its own host can post', async () => {
    const res = await leadsApp().request('/api/os/leads', { method: 'OPTIONS' })
    assert.equal(res.status, 204)
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*')
    assert.match(res.headers.get('Access-Control-Allow-Methods') || '', /POST/)
  })

  it('tells the visitor what to fix rather than failing silently', async () => {
    const res = await post({ projectRef: 'projleads01', email: 'a@b.co' })
    const body = (await res.json()) as { ok: boolean; message: string }
    assert.equal(res.status, 400)
    assert.equal(body.ok, false)
    assert.match(body.message, /name/i)
  })

  it('an unreachable backend reads as a retry, never as an engine error', async () => {
    const res = await post({
      projectRef: 'projleads02',
      name: 'Asha Menon',
      email: 'asha@example.com',
      message: 'Do you shoot weddings?',
    })
    const body = (await res.json()) as { ok: boolean; message: string }
    assert.equal(res.status, 503)
    assert.equal(body.ok, false)
    assert.match(body.message, /try again/i)
    assert.doesNotMatch(body.message, ENGINE_WORDS)
  })

  it('a flood from one visitor is turned away politely', async () => {
    const lead = { projectRef: 'projleads03', name: 'Asha Menon', phone: '9876543210' }
    const headers = { 'x-forwarded-for': '10.0.0.9' }
    for (let i = 0; i < 5; i += 1) await post(lead, headers)
    const res = await post(lead, headers)
    const body = (await res.json()) as { ok: boolean; message: string }
    assert.equal(res.status, 429)
    assert.doesNotMatch(body.message, ENGINE_WORDS)
  })

  it('the enquiry inbox is closed to anyone without an operator session', async () => {
    const app = new Hono()
    let loaded = false
    app.get('/api/os/leads', (c) =>
      handleLeadsList(c, async () => {
        loaded = true
        return []
      }),
    )
    const res = await app.request('/api/os/leads?projectRef=projleads04')
    assert.equal(res.status === 401 || res.status === 403, true, `unexpected status ${res.status}`)
    assert.equal(loaded, false)
  })

  it('triage only accepts new or handled, and never from a guest', async () => {
    assert.equal(normalizeLeadStatus('handled'), 'handled')
    assert.equal(normalizeLeadStatus('closed'), 'handled')
    assert.equal(normalizeLeadStatus('NEW'), 'new')
    assert.equal(normalizeLeadStatus('spam'), null)
    assert.equal(sanitizeLeadId('../etc'), '')
    assert.equal(sanitizeLeadId('!!!'), '')
    assert.equal(sanitizeLeadId('lead01abc'), 'lead01abc')

    const app = new Hono()
    let applied = false
    app.patch('/api/os/leads/:id', (c) =>
      handleLeadStatusUpdate(c, async () => {
        applied = true
        return { ok: true, id: 'lead01abc', status: 'handled' }
      }),
    )
    const guest = await app.request('/api/os/leads/lead01abc', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'handled' }),
    })
    assert.equal(guest.status === 401 || guest.status === 403, true, `guest got ${guest.status}`)
    assert.equal(applied, false)
  })

  it('an authenticated owner can mark an enquiry handled', async () => {
    const SECRET = 'leads-triage-test-secret-32chars!!'
    const prev = process.env.BUILDER_CFOS_HANDOFF_SECRET
    process.env.BUILDER_CFOS_HANDOFF_SECRET = SECRET
    try {
      const { createSessionToken, SESSION_COOKIE } = await import('../auth.ts')
      const token = createSessionToken(
        {
          gotrueId: 'user-triage',
          email: 'owner@indobase.in',
          projectRef: 'projtriage1',
          orgSlug: 'acme',
          projectName: 'Harbor Studio',
          studioUrl: 'https://studio.indobase.in',
        },
        SECRET,
      )
      const app = new Hono()
      const seen: Array<{ projectRef: string; leadId: string; status: string }> = []
      app.patch('/api/os/leads/:id', (c) =>
        handleLeadStatusUpdate(c, async (input) => {
          seen.push(input)
          return { ok: true, id: input.leadId, status: input.status }
        }),
      )
      const res = await app.request('/api/os/leads/lead01abc', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE}=${token}`,
        },
        body: JSON.stringify({ status: 'handled' }),
      })
      const body = (await res.json()) as { ok: boolean; status: string }
      assert.equal(res.status, 200)
      assert.equal(body.ok, true)
      assert.equal(body.status, 'handled')
      assert.deepEqual(seen, [{ projectRef: 'projtriage1', leadId: 'lead01abc', status: 'handled' }])

      const badStatus = await app.request('/api/os/leads/lead01abc', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE}=${token}`,
        },
        body: JSON.stringify({ status: 'spam' }),
      })
      assert.equal(badStatus.status, 400)
    } finally {
      if (prev === undefined) delete process.env.BUILDER_CFOS_HANDOFF_SECRET
      else process.env.BUILDER_CFOS_HANDOFF_SECRET = prev
    }
  })

  it('a form that posts nowhere counts as dead, a bound one does not', () => {
    assert.equal(landingFormIsDead('<form><input name="email" /></form>'), true)
    assert.equal(landingFormIsDead('<h1>No form here</h1>'), false)
    assert.equal(
      landingFormIsDead(injectLeadsRuntimeIntoHtml('<body><form></form></body>', 'proj_lead_1')),
      false,
    )
  })
})

function websiteWithLeads(leads: RuntimeView['leads']): RuntimeView {
  return {
    ...emptyBusinessRuntimeState({
      business: { ref: 'p9', name: 'Harbor Studio', kind: 'landing', state: 'live' },
      spec: { businessName: 'Harbor Studio', businessType: 'landing' },
      preview: { status: 'ready', url: '/live/p9/' },
      live: { isLive: true, url: 'https://harbor.sites.indobase.in' },
      health: { catalogReady: false, paymentsReady: false, previewReady: true },
    }),
    leads,
  }
}

describe('enquiry inbox', () => {
  it('shows the owner who wrote in, how to reply, and when', () => {
    const surface = composePresentation(
      websiteWithLeads([
        {
          id: 'lead1',
          name: 'Asha Menon',
          email: 'asha@example.com',
          message: 'Do you shoot weddings in December?',
          createdAt: '2026-08-14 09:12:00Z',
        },
        { id: 'lead2', name: 'Ravi Kumar', phone: '9876543210', message: '' },
      ]),
    )

    assert.deepEqual(
      surface.home.leads.map((l) => [l.name, l.contact]),
      [
        ['Asha Menon', 'asha@example.com'],
        ['Ravi Kumar', '9876543210'],
      ],
    )
    assert.equal(surface.home.leads[0].message, 'Do you shoot weddings in December?')
    assert.equal(surface.home.leads[0].receivedAt?.slice(0, 10), '2026-08-14')
    assert.equal(surface.home.leads[0].status, 'new')
    assert.equal(
      surface.home.metrics.find((m) => m.id === 'leads')?.label,
      'Open enquiries',
    )
    assert.equal(
      surface.home.metrics.find((m) => m.id === 'leads')?.value,
      '2',
      'the overview should count open enquiries',
    )
    assert.equal(surface.control.leads.length, 2)
    assert.match(surface.home.inboxStatus || '', /2 open enquiries/i)
    assert.equal(surface.home.inboxSection, 'leads')
  })

  it('handled enquiries sink below open ones and leave the open count', () => {
    const surface = composePresentation(
      websiteWithLeads([
        {
          id: 'leadold',
          name: 'Handled first',
          email: 'old@example.com',
          status: 'handled',
          createdAt: '2026-08-15 10:00:00Z',
        },
        {
          id: 'leadnew',
          name: 'Still open',
          email: 'new@example.com',
          status: 'new',
          createdAt: '2026-08-14 09:00:00Z',
        },
      ]),
    )
    assert.deepEqual(
      surface.home.leads.map((l) => [l.name, l.status]),
      [
        ['Still open', 'new'],
        ['Handled first', 'handled'],
      ],
    )
    assert.equal(surface.home.metrics.find((m) => m.id === 'leads')?.value, '1')
    assert.match(surface.home.inboxStatus || '', /1 open enquiry/i)
  })

  it('the owner gets a plain email when someone writes in', async () => {
    rememberBusinessSpec(
      'projnotify1',
      inferBusinessSpec('Launch a photography studio website called Harbor Studio'),
    )
    const sent: Array<{ to: string; subject: string; text: string }> = []
    const result = await notifyOwnerOfLead({
      projectRef: 'projnotify1',
      lead: {
        name: 'Asha Menon',
        email: 'asha@example.com',
        phone: '',
        message: 'Do you shoot weddings in December?',
        source: 'website',
      },
      lookupOwner: async () => ({ email: 'owner@indobase.in' }),
      send: async (message) => {
        sent.push(message)
        return true
      },
    })
    assert.equal(result.sent, true)
    assert.equal(sent[0]?.to, 'owner@indobase.in')
    assert.match(sent[0]?.subject || '', /Harbor Studio/)
    assert.match(sent[0]?.text || '', /Asha Menon/)
    assert.match(sent[0]?.text || '', /asha@example.com/)
    assert.match(sent[0]?.text || '', /Open your inbox/)
    assert.match(sent[0]?.text || '', /[?&]screen=leads/)
    assert.doesNotMatch(sent[0]?.text || '', /PocketBase|projectRef|admin/i)

    const missing = await notifyOwnerOfLead({
      projectRef: 'projnotify1',
      lead: {
        name: 'Asha Menon',
        email: 'asha@example.com',
        phone: '',
        message: '',
        source: 'website',
      },
      lookupOwner: async () => null,
      send: async () => true,
    })
    assert.equal(missing.sent, false)
    if (!missing.sent) assert.equal(missing.reason, 'no_owner')
  })

  it('notify copy stays short and includes a way back to the inbox', () => {
    const message = composeLeadNotifyMessage({
      brand: 'Harbor Studio',
      lead: {
        name: 'Asha',
        email: 'a@b.co',
        phone: '',
        message: 'x'.repeat(400),
        source: 'website',
      },
      inboxUrl: workspaceLeadsInboxUrl('https://builder.indobase.in'),
    })
    assert.ok(message.text.length < 700)
    assert.match(message.text, /…/)
    assert.match(message.text, /builder\.indobase\.in\/\?screen=leads/)
  })

  it('deep links only accept plain Control Center section ids', () => {
    assert.equal(readWorkspaceScreenFromSearch('?screen=leads'), 'leads')
    assert.equal(readWorkspaceScreenFromSearch('?screen=LEADS'), 'leads')
    assert.equal(readWorkspaceScreenFromSearch('?screen=../secret'), null)
    assert.equal(readWorkspaceScreenFromSearch(''), null)
    assert.equal(workspaceLeadsInboxUrl('https://builder.indobase.in/'), 'https://builder.indobase.in/?screen=leads')
    assert.equal(workspaceOrdersInboxUrl('https://builder.indobase.in'), 'https://builder.indobase.in/?screen=orders')
  })

  it('a long enquiry is trimmed for the list instead of flooding it', () => {
    const surface = composePresentation(
      websiteWithLeads([{ id: 'lead3', name: 'Asha Menon', email: 'asha@example.com', message: 'x'.repeat(400) }]),
    )
    assert.equal(surface.home.leads[0].message.length, 140)
    assert.match(surface.home.leads[0].message, /…$/)
  })

  it('a store never grows an enquiry inbox', () => {
    const store = {
      ...emptyBusinessRuntimeState({
        business: { ref: 'p8', name: 'Summit Outfitters', kind: 'ecommerce', state: 'live' },
        spec: { businessName: 'Summit Outfitters', businessType: 'ecommerce' },
        preview: { status: 'ready', url: '/live/p8/' },
        health: { catalogReady: true, paymentsReady: true, previewReady: true },
      }),
      leads: [{ id: 'stray', name: 'Stray', email: 'stray@example.com' }],
    } satisfies RuntimeView
    const surface = composePresentation(store)
    assert.deepEqual(surface.home.leads, [])
    assert.equal(
      surface.home.metrics.some((m) => m.id === 'leads'),
      false,
    )
  })

  it('the Control Center renders the enquiries, not a placeholder button', () => {
    const source = readFileSync(
      join(import.meta.dirname, '../../../branding/followups/BusinessControlCenter.tsx'),
      'utf8',
    )
    assert.match(source, /section === 'leads' \?/)
    assert.match(source, /No enquiries yet/)
    assert.match(source, /Mark handled/)
    assert.match(source, /method: 'PATCH'/)
    assert.match(source, /\/api\/os\/leads\//)
    assert.match(source, /navBadge/)
    assert.match(source, /inboxStatus/)
    assert.match(source, /inboxSection/)
    assert.match(source, /readWorkspaceScreenFromSearch/)
    assert.match(source, /openOrderCount/)
    assert.match(source, /screen=leads|sectionFromUrl|deepLinkApplied/)
    const chrome = readFileSync(
      join(import.meta.dirname, '../../../branding/followups/WorkspaceChrome.tsx'),
      'utf8',
    )
    assert.match(chrome, /MERCHANT_ADMIN_NAV/)
    assert.match(chrome, /allowControl/)
    assert.match(chrome, /deepLinkScreen/)
    assert.match(chrome, /readWorkspaceScreenFromSearch/)
    assert.doesNotMatch(chrome, /const showChromeAside = false/)
    assert.doesNotMatch(
      source,
      /section === 'content' \|\|\s*\n\s*section === 'leads'/,
      'leads must not fall back to the generic "Open <section>" placeholder',
    )
  })

  it('an enquiry reaches the operator session the Control Center reads', () => {
    clearBusinessSpecsForTests()
    const session: Session = {
      gotrueId: 'user-9',
      email: 'owner@indobase.in',
      projectRef: 'projleads09',
      orgSlug: 'acme',
      projectName: 'Harbor Studio',
      studioUrl: 'https://studio.indobase.in',
    }
    rememberBusinessSpec(
      session.projectRef,
      inferBusinessSpec('Launch a photography studio website called Harbor Studio'),
    )

    const payload = buildSessionApiPayload({
      session,
      agentHint: '',
      generation: { schemaVersion: 1 },
      agentRuntimeConfigured: true,
      agentRuntimeUrl: 'http://127.0.0.1:8787',
      osProxyPath: '/os/app/',
      indobaseProxyPath: '/api/indobase/proxy/',
      businessSnapshot: {
        products: [],
        orders: [],
        leads: [{ id: 'lead9', name: 'Asha Menon', email: 'asha@example.com', message: 'Wedding in December?' }],
      },
    })

    assert.equal(payload.runtime.leads.length, 1)
    assert.equal(payload.ux.home.leads[0]?.name, 'Asha Menon')
    assert.equal(payload.ux.home.metrics.find((m) => m.id === 'leads')?.value, '1')
  })

  it('the operator copy of presentation stays in step with the bridge', () => {
    const bridge = readFileSync(join(import.meta.dirname, '../ux/presentation.ts'), 'utf8')
    const client = readFileSync(
      join(import.meta.dirname, '../../../branding/followups/presentation.ts'),
      'utf8',
    )
    const normalize = (text: string) =>
      text
        .replace(/from '\.\.\/ux-conductor\.js'/, "from './ux-conductor'")
        .replace(/currency\?: string; verticalId\?: string/, 'currency?: string')
    assert.equal(normalize(client), normalize(bridge))
  })
})
