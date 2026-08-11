import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  BUSINESS_OS_DISCOVERABLE_ACTIONS,
  BUSINESS_OS_FINISH_IN_OS_PRINCIPLE,
  BUSINESS_OS_NAV,
  businessOsNavById,
  discoverableActionsForSession,
} from './business-os-nav.ts'
import {
  injectIndobaseContextBootstrap,
  renderLandingHtml,
  renderOfflineDesktopHtml,
  renderStartHtml,
  renderWorkspaceHtml,
} from './workspace-html.ts'
import type { Session } from './auth.ts'

describe('business-os-nav', () => {
  it('keeps task catalog for agents/API (not rendered as fat rail chrome)', () => {
    const ids = BUSINESS_OS_NAV.map((n) => n.id)
    for (const need of [
      'home',
      'ai',
      'website',
      'brand',
      'customers',
      'commerce',
      'launch',
      'settings',
    ]) {
      assert.ok(ids.includes(need as (typeof ids)[number]), `missing ${need}`)
    }
    assert.equal(ids.includes('studio' as never), false)
    assert.equal(ids.includes('design-app' as never), false)
  })

  it('Brand and Marketing force Design format in prompts', () => {
    const brand = businessOsNavById('brand')
    const marketing = businessOsNavById('marketing')
    assert.match(brand?.prompt || '', /format\.design/)
    assert.match(marketing?.prompt || '', /format\.design/)
  })

  it('launch catalog entry speaks go-live (substrate stays publish)', () => {
    const launch = businessOsNavById('launch')
    assert.equal(launch?.label, 'Launch Business')
    assert.match(launch?.prompt || '', /launchBusiness|go live/i)
    assert.match(launch?.prompt || '', /\/api\/os\/tools\/launchBusiness|live URL/i)
    assert.doesNotMatch(launch?.prompt || '', /\bdeploy\b|\bhosting\b/i)
  })

  it('exposes discoverable SaaS actions (Go Live, Create account, Add login)', () => {
    const ids = BUSINESS_OS_DISCOVERABLE_ACTIONS.map((a) => a.id)
    for (const need of ['create-account', 'go-live', 'add-login', 'login-mail', 'enable-payments']) {
      assert.ok(ids.includes(need), `missing ${need}`)
    }
    const guestActions = discoverableActionsForSession({ guest: true })
    assert.ok(guestActions.some((a) => a.id === 'create-account'))
    assert.equal(guestActions.some((a) => a.id === 'go-live'), false)

    const signedIn = discoverableActionsForSession({ guest: false })
    assert.ok(signedIn.some((a) => a.id === 'go-live'))
    assert.ok(signedIn.some((a) => a.id === 'add-login'))
    assert.equal(signedIn.some((a) => a.id === 'create-account'), false)
  })

  it('states the finish-in-OS principle', () => {
    assert.match(BUSINESS_OS_FINISH_IN_OS_PRINCIPLE, /without leaving Indobase OS/)
  })
})

describe('core workspace chrome', () => {
  const session: Session = {
    gotrueId: 'local-poc',
    email: 'poc@indobase.in',
    projectRef: 'poc',
    orgSlug: 'local',
    projectName: 'Local PoC',
    studioUrl: 'https://studio.indobase.in',
  }

  it('landing is emergency fallback only (no Start building funnel)', () => {
    const html = renderLandingHtml()
    assert.match(html, /Indobase/)
    assert.doesNotMatch(html, /Start building/)
    assert.doesNotMatch(html, /Send code/)
    assert.doesNotMatch(html, /achievement-grid/)
    assert.doesNotMatch(html, /Go Live/)
    assert.doesNotMatch(html, /header class="ibar"/)
  })

  it('legacy start page bounces into OS (account in chat)', () => {
    const html = renderStartHtml()
    assert.match(html, /Opening Indobase OS|url=\//)
    assert.doesNotMatch(html, /id="name"/)
    assert.doesNotMatch(html, /Send code/)
  })

  it('desktop has no iframe shell / outer ibar (direct CFOS document)', () => {
    const html = renderWorkspaceHtml({
      session,
      cloudflareOsConfigured: true,
      osProxyPath: '/os/app/',
      agentRuntimeUrl: 'http://127.0.0.1:8787',
    })
    assert.doesNotMatch(html, /id="os-frame"/)
    assert.doesNotMatch(html, /header class="ibar"/)
    assert.doesNotMatch(html, /id="go-live"/)
    assert.doesNotMatch(html, /aside class="rail"/)
    assert.doesNotMatch(html, /rail-nav/)
    assert.doesNotMatch(html, /achievement-grid/)
  })

  it('offline page has no iframe chrome', () => {
    const html = renderOfflineDesktopHtml(session)
    assert.match(html, /Agent desktop offline/)
    assert.doesNotMatch(html, /id="os-frame"/)
    assert.doesNotMatch(html, /header class="ibar"/)
  })

  it('context bootstrap pulls /api/session (launch + auth chrome)', () => {
    const html = injectIndobaseContextBootstrap('<html><body><div id="app"></div></body></html>')
    assert.doesNotMatch(html, /id="os-frame"/)
    assert.doesNotMatch(html, /header class="ibar"/)
    assert.match(html, /\/api\/session/)
    assert.match(html, /__INDOBASE_AGENT_HINT__/)
    assert.match(html, /__INDOBASE_ONBOARDING__/)
    assert.match(html, /__INDOBASE_USAGE__/)
    assert.match(html, /__INDOBASE_ACTIONS__/)
    assert.match(html, /__INDOBASE_LAUNCH__/)
    assert.match(html, /\/api\/os\/tools\/launchBusiness/)
    assert.match(html, /\/api\/os\/launch/)
    assert.match(html, /PROMPT_QUOTA/)
    assert.match(html, /\/api\/os\/usage\/prompt-quota/)
    assert.match(html, /__INDOBASE_BEGIN_TURN__/)
    assert.match(html, /\/api\/os\/agent\/begin-turn/)
    assert.match(html, /indobase:context/)
    assert.match(html, /GUEST/)
    assert.match(html, /ONBOARDING/)
    assert.match(html, /Create your Indobase account/)
    assert.doesNotMatch(html, /id="ib-auth-fab"/)
    assert.match(html, /__INDOBASE_SESSION_STAGE__/)
  })
})
