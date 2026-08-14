import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it, beforeEach } from 'node:test'

import type { Session } from '../auth.ts'
import { clearBusinessSpecsForTests, inferBusinessSpec, rememberBusinessSpec } from '../ux/business-spec.ts'
import { clearWorkspaceRuntimesForTests, emptyPersistedRuntime, rememberWorkspaceRuntime } from '../ux/runtime-store.ts'
import { assertLaunchWireReady } from '../wire-proof.ts'
import {
  clearProductionLaunchJobsForTests,
  executeProductionLaunchJob,
  getProductionLaunchJob,
  planProductionApp,
  resolveProductionContract,
  buildProductionLandingHtml,
  buildProductionSaasHtml,
  summarizeProductionLaunchJob,
  launchProductionAppToolCatalog,
} from './index.ts'

const session: Session = {
  gotrueId: 'user-1',
  email: 'op@indobase.in',
  projectRef: 'proj_launch',
  orgSlug: 'acme',
  projectName: 'Demo',
  studioUrl: 'https://studio.indobase.in',
}

const backend = {
  anon_key: 'public',
  api_url: 'https://records.example.indobase.in',
  auth_url: 'https://records.example.indobase.in/api',
  rest_url: 'https://records.example.indobase.in/api/collections',
  storage_url: 'https://records.example.indobase.in/api/files',
  project_name: 'Demo',
  project_ref: 'appdemo01',
  project_url: 'https://records.example.indobase.in',
}

describe('application planner', () => {
  it('classifies CRM as saas with backend required', () => {
    const plan = planProductionApp({ intent: 'Build me a CRM for small businesses' })
    assert.equal(plan.appType, 'saas')
    assert.equal(plan.backendRequired, true)
    assert.equal(plan.authRequired, true)
    assert.equal(plan.source, 'inferred')
  })

  it('classifies restaurant brochure as landing', () => {
    const plan = planProductionApp({ intent: 'Build me a website for my restaurant' })
    assert.equal(plan.appType, 'landing')
    assert.equal(plan.backendRequired, false)
  })

  it('classifies restaurant ordering as ecommerce', () => {
    const plan = planProductionApp({ intent: 'Build me a restaurant ordering website with checkout' })
    assert.equal(plan.appType, 'ecommerce')
    assert.equal(plan.commerceRequired, true)
  })

  it('honors explicit appType over ambiguous intent', () => {
    const plan = planProductionApp({ appType: 'saas', intent: 'website' })
    assert.equal(plan.appType, 'saas')
    assert.equal(plan.source, 'explicit')
  })

  it('Launch my app infers saas, not landing', () => {
    const plan = planProductionApp({ intent: 'Launch my app on Indobase now.' })
    assert.equal(plan.appType, 'saas')
  })
})

describe('production contracts + shells', () => {
  it('returns saas contract with required auth flows', () => {
    const c = resolveProductionContract('saas')
    assert.equal(c.applicationType, 'saas')
    assert.equal(c.production, true)
    assert.ok(c.capabilities.some((x) => x.id === 'auth' && x.required))
    assert.ok(c.requiredFlows.includes('login'))
  })

  it('landing shell includes SEO + legal links', () => {
    const html = buildProductionLandingHtml({ brand: 'Cafe', intent: 'Neighborhood cafe' })
    assert.match(html, /<title>Cafe<\/title>/)
    assert.match(html, /meta name="description"/)
    assert.match(html, /Privacy Policy/)
    assert.match(html, /data-ib-section="hero"/)
    assert.match(html, /Terms of Service/)
  })

  it('saas shell is wire-ready against managed backend', () => {
    const html = buildProductionSaasHtml({ brand: 'Northwind', backend })
    const wire = assertLaunchWireReady({
      html,
      backend,
      requireWire: true,
    })
    assert.equal(wire.ok, true)
    assert.match(html, /__INDOBASE_ENV__/)
    assert.match(html, /\/records/)
    assert.match(html, /auth-with-otp/)
  })
})

describe('production launch job pipeline', () => {
  function seedPreviewReady() {
    const spec = rememberBusinessSpec(
      session.projectRef,
      inferBusinessSpec('Build a website called Demo Site'),
    )
    rememberWorkspaceRuntime({
      ...emptyPersistedRuntime(session.projectRef),
      spec,
      artifactHtml: '<html><body><h1>Demo Shop</h1></body></html>',
      preview: {
        status: 'ready',
        url: `/live/${session.projectRef}/`,
        artifactRef: 'preview',
        contentHash: 'hash',
        httpOk: true,
      },
    })
  }

  beforeEach(() => {
    process.env.INDOBASE_PRODUCTION_JOB_DIR = mkdtempSync(path.join(tmpdir(), 'plj-'))
    clearProductionLaunchJobsForTests()
    clearBusinessSpecsForTests()
    clearWorkspaceRuntimesForTests()
    seedPreviewReady()
  })

  it('blocks production when preview is not READY', async () => {
    clearBusinessSpecsForTests()
    clearWorkspaceRuntimesForTests()
    const result = await executeProductionLaunchJob(session, {
      intent: 'Launch a premium outdoor gear store called CedarPeak',
      appType: 'ecommerce',
    })
    assert.equal(result.ok, false)
    assert.equal(result.claim_live, false)
    assert.equal(result.code, 'preview_required')
  })

  it('catalog points at the platform job, not ensure tools', () => {
    const catalog = launchProductionAppToolCatalog()
    assert.equal(catalog.name, 'launchProductionApp')
    assert.equal(catalog.path, '/api/os/apps/launch')
    assert.match(catalog.description, /Do not assemble production yourself/)
  })

  it('landing job skips provision and reaches LIVE', async () => {
    const result = await executeProductionLaunchJob(
      session,
      { intent: 'Website for my bakery', appType: 'landing', brand: 'Flour & Co' },
      {
        launch: async () => ({
          ok: true,
          status: 'published',
          url: 'https://flour.sites.indobase.in',
          message: 'published',
          lane: 'static',
          claim_live: true,
          tool: 'launchBusiness',
        }),
        smoke: async () => ({ ok: true, message: 'ok' }),
      },
    )
    assert.equal(result.ok, true)
    assert.equal(result.claim_live, true)
    assert.equal(result.job.status, 'live')
    assert.equal(result.job.appType, 'landing')
    const provision = result.job.stages.find((s) => s.id === 'provision')
    assert.equal(provision?.status, 'skipped')
    assert.equal(result.url, 'https://flour.sites.indobase.in')
    const stored = getProductionLaunchJob(result.job.jobId)
    assert.equal(stored?.status, 'live')
    const summary = summarizeProductionLaunchJob(result.job)
    assert.equal(summary.counts.failed, 0)
  })

  it('saas job provisions via guidedBackend then LIVE — agent does not choose stages', async () => {
    let guidedCalled = false
    const result = await executeProductionLaunchJob(
      session,
      { intent: 'Launch a SaaS CRM', appType: 'saas', brand: 'Northwind' },
      {
        guided: async () => {
          guidedCalled = true
          return {
            ok: true,
            tool: 'guidedBackend',
            mode: 'generic',
            steps: [{ id: 'ensureLogin', status: 'ok', message: 'ok' }],
            progress: 'backend ready',
            message: 'backend ready',
            claim_backend_ready: true,
            claim_live: false,
            backend: {
              api_url: backend.api_url,
              anon_key: backend.anon_key,
              project_ref: backend.project_ref,
              project_name: backend.project_name,
            },
          }
        },
        launch: async (_ref, input) => {
          assert.match(input.html || '', /auth-with-otp/)
          assert.equal(input.app_type, 'saas')
          return {
            ok: true,
            status: 'published',
            url: 'https://northwind.sites.indobase.in',
            message: 'published',
            lane: 'static',
            claim_live: true,
            tool: 'launchBusiness',
          }
        },
        smoke: async () => ({ ok: true, message: 'saas smoke' }),
      },
    )
    assert.equal(guidedCalled, true)
    assert.equal(result.ok, true)
    assert.equal(result.job.status, 'live')
    assert.equal(result.job.plan.backendRequired, true)
    assert.ok(result.job.backend?.api_url)
    assert.equal(
      result.job.stages.every((s) => s.status === 'ok' || s.status === 'skipped'),
      true,
    )
    assert.equal(
      result.job.stages.find((s) => s.id === 'provision')?.title,
      'Setting up accounts',
    )
    assert.equal(
      result.job.stages.find((s) => s.id === 'wire')?.title,
      'Connecting your data',
    )
  })

  it('saas preview HTML without runtime ABI is bound before LIVE and keeps the edited headline', async () => {
    const result = await executeProductionLaunchJob(
      session,
      {
        intent: 'Launch a tutoring SaaS called TutorDesk',
        appType: 'saas',
        brand: 'TutorDesk',
        html: '<html><body><h1>TutorDesk</h1><p>Schedule sessions with students.</p></body></html>',
      },
      {
        guided: async () => ({
          ok: true,
          tool: 'guidedBackend',
          mode: 'generic',
          steps: [{ id: 'ensureLogin', status: 'ok', message: 'ok' }],
          progress: 'backend ready',
          message: 'backend ready',
          claim_backend_ready: true,
          claim_live: false,
          backend: {
            api_url: backend.api_url,
            anon_key: backend.anon_key,
            project_ref: backend.project_ref,
            project_name: backend.project_name,
          },
        }),
        launch: async (_ref, input) => {
          assert.match(input.html || '', /auth-with-otp/)
          assert.match(input.html || '', /__INDOBASE_ENV__|\/api\/collections\//)
          assert.match(input.html || '', /<h1>TutorDesk<\/h1>/)
          assert.equal(input.app_type, 'saas')
          return {
            ok: true,
            status: 'published',
            url: 'https://tutordesk.sites.indobase.in',
            message: 'published',
            lane: 'static',
            claim_live: true,
            tool: 'launchBusiness',
          }
        },
        smoke: async () => ({ ok: true, message: 'saas smoke' }),
      },
    )
    assert.equal(result.ok, true)
    assert.equal(result.job.status, 'live')
    assert.equal(result.job.appType, 'saas')
    assert.match(result.job.html || '', /auth-with-otp/)
  })

  it('ecommerce stub HTML is replaced with a shop storefront before LIVE', async () => {
    const result = await executeProductionLaunchJob(
      session,
      {
        intent: 'Launch a premium sneaker store called UrbanThread',
        appType: 'ecommerce',
        brand: 'UrbanThread',
        html: '<html><body><h1>your business</h1><ul><li>One</li></ul></body></html>',
      },
      {
        guided: async () => ({
          ok: true,
          tool: 'guidedBackend',
          mode: 'ecommerce',
          steps: [
            { id: 'ensureDatabase', status: 'ok', message: 'ok' },
            { id: 'setupShopCatalog', status: 'ok', message: 'ok' },
            { id: 'placeTestShopOrder', status: 'ok', message: 'ok' },
          ],
          progress: 'catalog + test order',
          message: 'backend ready',
          claim_backend_ready: true,
          claim_live: false,
          catalog_json: [{ slug: 'apex', name: 'Apex', stock: 8 }],
          backend: {
            api_url: backend.api_url,
            anon_key: backend.anon_key,
            project_ref: backend.project_ref,
            project_name: backend.project_name,
          },
        }),
        launch: async (_ref, input) => {
          assert.match(input.html || '', /Add to cart/)
          assert.match(input.html || '', /indobase\.commerce|\/api\/os\/commerce/)
          assert.doesNotMatch(input.html || '', /<h1>your business<\/h1>/)
          return {
            ok: true,
            status: 'published',
            url: 'https://urbanthread.sites.indobase.in',
            message: 'published',
            lane: 'static',
            claim_live: true,
            tool: 'launchBusiness',
          }
        },
        smoke: async () => ({ ok: true, message: 'commerce smoke' }),
      },
    )
    assert.equal(result.ok, true)
    assert.equal(result.job.status, 'live')
    assert.match(result.job.html || '', /Add to cart/)
  })

  it('ecommerce job provisions internally and records certification evidence', async () => {
    const result = await executeProductionLaunchJob(
      session,
      {
        intent: 'Launch a sneaker store called Velocity',
        appType: 'ecommerce',
        brand: 'Velocity',
        html: '<html><body><script>window.indobase={commerce:{checkout:{create:function(){}}}}</script></body></html>',
      },
      {
        guided: async () => ({
          ok: true,
          tool: 'guidedBackend',
          mode: 'ecommerce',
          steps: [
            { id: 'ensureDatabase', status: 'ok', message: 'ok' },
            { id: 'setupShopCatalog', status: 'ok', message: 'ok' },
            { id: 'placeTestShopOrder', status: 'ok', message: 'ok' },
          ],
          progress: 'catalog + test order',
          message: 'backend ready',
          claim_backend_ready: true,
          claim_live: false,
          catalog_json: [{ slug: 'runner', name: 'Runner', stock: 10 }],
          storefront_html: '<html>commerce</html>',
          backend: {
            api_url: backend.api_url,
            anon_key: backend.anon_key,
            project_ref: backend.project_ref,
            project_name: backend.project_name,
          },
        }),
        launch: async () => ({
          ok: true,
          status: 'published',
          url: 'https://velocity.sites.indobase.in',
          message: 'published',
          lane: 'static',
          claim_live: true,
          tool: 'launchBusiness',
        }),
        smoke: async () => ({ ok: true, message: 'commerce smoke' }),
      },
    )
    assert.equal(result.ok, true)
    assert.equal(result.job.status, 'live')
    assert.equal(result.job.evidence?.backend_ready, true)
    assert.equal(result.job.evidence?.catalog_seeded, true)
    assert.equal(result.job.evidence?.test_order_ok, true)
    assert.equal(result.job.evidence?.smoke_ok, true)
    assert.equal(result.job.evidence?.claim_production_ready, true)
  })

  it('blocks LIVE when smoke fails and does not invent a URL claim', async () => {
    const result = await executeProductionLaunchJob(
      session,
      { intent: 'landing page', appType: 'landing', html: '<html><body>Hi</body></html>' },
      {
        launch: async () => ({
          ok: true,
          status: 'published',
          url: 'https://broken.sites.indobase.in',
          message: 'published',
          lane: 'static',
          claim_live: true,
          tool: 'launchBusiness',
        }),
        smoke: async () => ({ ok: false, message: 'Smoke failed: HTTP 500' }),
      },
    )
    assert.equal(result.ok, false)
    assert.equal(result.claim_live, false)
    assert.equal(result.job.claim_live, false)
    assert.equal(result.job.status, 'blocked')
    assert.match(result.message, /couldn't safely launch/i)
    assert.doesNotMatch(result.message, /LAUNCH BLOCKED|smoke_failed|backend_required/i)
    assert.equal(result.job.failures[0]?.code, 'smoke_failed')
    assert.equal(result.code, 'smoke_failed')
  })

  it('publishes the frozen preview HTML instead of regenerating a generic storefront', async () => {
    const frozen =
      '<html><body><h1>Midnight Alpine drops</h1><script>window.indobase={commerce:{checkout:{create:function(){}}}}</script></body></html>'
    const result = await executeProductionLaunchJob(
      session,
      {
        intent: 'Launch my store',
        appType: 'ecommerce',
        brand: 'NorthPeak',
        html: frozen,
      },
      {
        guided: async () => ({
          ok: true,
          tool: 'guidedBackend',
          mode: 'ecommerce',
          steps: [{ id: 'placeTestShopOrder', status: 'ok', message: 'ok' }],
          progress: 'ok',
          message: 'ok',
          claim_backend_ready: true,
          claim_live: false,
          storefront_html: '<html><body><h1>NorthPeak / Order online.</h1></body></html>',
          backend: {
            api_url: backend.api_url,
            anon_key: backend.anon_key,
            project_ref: backend.project_ref,
            project_name: backend.project_name,
          },
        }),
        launch: async (_ref, input) => {
          assert.match(input.html || '', /Midnight Alpine drops/)
          assert.doesNotMatch(input.html || '', /Order online/)
          return {
            ok: true,
            status: 'published',
            url: 'https://northpeak.sites.indobase.in',
            message: 'published',
            lane: 'static',
            claim_live: true,
            tool: 'launchBusiness',
          }
        },
        smoke: async () => ({ ok: true, message: 'ok' }),
      },
    )
    assert.equal(result.ok, true)
    assert.equal(result.job.frozenArtifactHash, result.job.publishedArtifactHash)
    assert.match(result.job.html || '', /Midnight Alpine drops/)
  })

  it('freezes unique ecommerce HTML without commerce ABI and does not substitute the managed shop template', async () => {
    const unique =
      '<html><head><style>h1{color:#111111;font-family:Playfair Display,serif}</style></head><body><nav>Apex Run</nav><h1>Apex midnight editorial</h1><button>Add to cart</button></body></html>'
    const result = await executeProductionLaunchJob(
      session,
      {
        intent: 'Launch my store',
        appType: 'ecommerce',
        brand: 'Apex',
        html: unique,
      },
      {
        guided: async () => ({
          ok: true,
          tool: 'guidedBackend',
          mode: 'ecommerce',
          steps: [{ id: 'placeTestShopOrder', status: 'ok', message: 'ok' }],
          progress: 'ok',
          message: 'ok',
          claim_backend_ready: true,
          claim_live: false,
          storefront_html: '<html><body><h1>Generic Shop / Order online.</h1></body></html>',
          backend: {
            api_url: backend.api_url,
            anon_key: backend.anon_key,
            project_ref: backend.project_ref,
            project_name: backend.project_name,
          },
        }),
        launch: async (_ref, input) => {
          assert.match(input.html || '', /Apex midnight editorial/)
          assert.match(input.html || '', /Playfair Display/)
          assert.match(input.html || '', /Apex Run/)
          assert.doesNotMatch(input.html || '', /Order online/)
          assert.doesNotMatch(input.html || '', /--accent:#3B8FD6/)
          assert.match(input.html || '', /\/api\/os\/commerce\/runtime\.js/)
          return {
            ok: true,
            status: 'published',
            url: 'https://apex.sites.indobase.in',
            message: 'published',
            lane: 'static',
            claim_live: true,
            tool: 'launchBusiness',
          }
        },
        smoke: async () => ({ ok: true, message: 'ok' }),
      },
    )
    assert.equal(result.ok, true)
    assert.ok(result.job.frozenArtifactHash)
    assert.equal(result.job.frozenArtifactHash, result.job.publishedArtifactHash)
    assert.match(result.job.html || '', /Apex midnight editorial/)
    assert.equal(result.job.html?.includes('Generic Shop'), false)
  })

  it('publishes the frozen SaaS preview HTML instead of replacing the edited headline', async () => {
    const frozen = `<html><body>
      <h1>Midnight tutoring</h1>
      <script>window.__INDOBASE_ENV__={INDOBASE_URL:'https://records.example.indobase.in'}</script>
      <script>fetch('/api/collections/users/auth-with-otp')</script>
    </body></html>`
    const result = await executeProductionLaunchJob(
      session,
      {
        intent: 'Launch a tutoring SaaS called TutorDesk',
        appType: 'saas',
        brand: 'TutorDesk',
        html: frozen,
      },
      {
        guided: async () => ({
          ok: true,
          tool: 'guidedBackend',
          mode: 'generic',
          steps: [{ id: 'ensureLogin', status: 'ok', message: 'ok' }],
          progress: 'ok',
          message: 'ok',
          claim_backend_ready: true,
          claim_live: false,
          backend: {
            api_url: backend.api_url,
            anon_key: backend.anon_key,
            project_ref: backend.project_ref,
            project_name: backend.project_name,
          },
        }),
        launch: async (_ref, input) => {
          assert.match(input.html || '', /Midnight tutoring/)
          assert.doesNotMatch(input.html || '', /<h1>TutorDesk<\/h1>/)
          return {
            ok: true,
            status: 'published',
            url: 'https://tutordesk.sites.indobase.in',
            message: 'published',
            lane: 'static',
            claim_live: true,
            tool: 'launchBusiness',
          }
        },
        smoke: async () => ({ ok: true, message: 'ok' }),
      },
    )
    assert.equal(result.ok, true)
    assert.equal(result.job.status, 'live')
    assert.equal(result.job.appType, 'saas')
    assert.ok(result.job.frozenArtifactHash)
    assert.equal(result.job.frozenArtifactHash, result.job.publishedArtifactHash)
    assert.match(result.job.html || '', /Midnight tutoring/)
  })

  it('publishes the frozen landing preview HTML instead of replacing the edited headline', async () => {
    const frozen = `<html><body>
      <h1>Harbor at midnight</h1>
      <p>A studio website.</p>
      <a href="/privacy">Privacy</a>
    </body></html>`
    const result = await executeProductionLaunchJob(
      session,
      {
        intent: 'Build a website called Harbor Studio',
        appType: 'landing',
        brand: 'Harbor Studio',
        html: frozen,
      },
      {
        launch: async () => ({
          ok: true,
          status: 'published',
          url: 'https://harbor.sites.indobase.in',
          message: 'published',
          lane: 'static',
          claim_live: true,
          tool: 'launchBusiness',
        }),
        smoke: async () => ({ ok: true, message: 'ok' }),
      },
    )
    assert.equal(result.ok, true)
    assert.equal(result.job.status, 'live')
    assert.equal(result.job.appType, 'landing')
    assert.ok(result.job.frozenArtifactHash)
    assert.equal(result.job.frozenArtifactHash, result.job.publishedArtifactHash)
    assert.match(result.job.html || '', /Harbor at midnight/)
    assert.doesNotMatch(result.job.html || '', /add to cart|indobase\.commerce/i)
  })
})
