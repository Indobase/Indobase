import assert from 'node:assert/strict'
import { createServer, type AddressInfo } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { Session } from '../auth.ts'
import { deriveAgentUsername } from '../agent-credentials.ts'
import { detectFabricatedClaims, isForbiddenAgentClaim, sanitizeAgentNarration } from '@indobase/platform'
import { clearProductionLaunchJobsForTests } from '../production-launch/index.ts'
import { clearExecutionPlansForTests } from './execution-store.ts'
import { readLiveFile } from '../static-launch.ts'
import {
  applyOperatorIntent,
  classifyOperatorIntent,
  launchCommandForIntent,
  turnClassForIntent,
  verifyNarration,
} from './execution-contract.ts'
import {
  clearWorkspaceRuntimesForTests,
  getWorkspaceRuntime,
  rememberPendingIntent,
  takePendingAcrossAuth,
} from './runtime-store.ts'
import { clearBusinessSpecsForTests, getBusinessSpec } from './business-spec.ts'
import { toBusinessRuntimeState } from './agent-truth.ts'
import { createMemoryStoreCommandDeps, executeStoreCommand } from './store-commands.ts'

const session: Session = {
  gotrueId: 'user-ftu',
  email: 'op@indobase.in',
  projectRef: 'rosh76e90375b6',
  orgSlug: 'acme',
  projectName: 'Workspace',
  studioUrl: 'https://studio.indobase.in',
}

const PROMPT = 'Launch a premium sneaker store called UrbanThread'
const BUILD_PROMPT = 'Build a premium sneaker store called UrbanThread'

const backend = {
  anon_key: 'public',
  api_url: 'https://records.example.indobase.in',
  auth_url: 'https://records.example.indobase.in/api',
  rest_url: 'https://records.example.indobase.in/api/collections',
  storage_url: 'https://records.example.indobase.in/api/files',
  project_name: 'UrbanThread',
  project_ref: 'appurban01',
  project_url: 'https://records.example.indobase.in',
}

function mockLaunchDeps(reached: { launchProductionApp: boolean }) {
  return {
    guided: async () => ({
      ok: true,
      tool: 'guidedBackend' as const,
      mode: 'ecommerce' as const,
      steps: [
        { id: 'ensureDatabase', status: 'ok' as const, message: 'ok' },
        { id: 'setupShopCatalog', status: 'ok' as const, message: 'ok' },
        { id: 'placeTestShopOrder', status: 'ok' as const, message: 'ok' },
      ],
      progress: 'catalog + test order',
      message: 'backend ready',
      claim_backend_ready: true,
      claim_live: false,
      catalog_json: [{ slug: 'apex-runner', name: 'Apex Runner', stock: 10 }],
      backend: {
        api_url: backend.api_url,
        anon_key: backend.anon_key,
        project_ref: backend.project_ref,
        project_name: backend.project_name,
      },
    }),
    launch: async () => {
      reached.launchProductionApp = true
      return {
        ok: true,
        status: 'published' as const,
        url: 'https://urbanthread-ftu.sites.indobase.in',
        message: 'published',
        lane: 'static' as const,
        claim_live: true,
        tool: 'launchBusiness' as const,
      }
    },
    smoke: async (url: string) => ({ ok: /^https:\/\//.test(url), message: 'smoke ok' }),
    ecommerceProbes: {
      catalogHttpOk: true,
      productRendered: true,
      cartOk: true,
      checkoutOk: true,
      orderOk: true,
      orderVisible: true,
      evidence: ['ftu injected'],
    },
    saasProbes: {
      authOk: true,
      workflowOk: true,
      persistenceOk: true,
      evidence: ['ftu injected'],
    },
  }
}

describe('FTU execution contract A–Q', () => {
  let launchDir = ''
  let jobDir = ''
  let server: ReturnType<typeof createServer> | null = null
  let publicBase = ''

  beforeEach(async () => {
    launchDir = await mkdtemp(path.join(os.tmpdir(), 'ftu-launch-'))
    jobDir = await mkdtemp(path.join(os.tmpdir(), 'ftu-job-'))
    process.env.INDOBASE_LAUNCH_ROOT = launchDir
    process.env.INDOBASE_PRODUCTION_JOB_DIR = jobDir
    clearWorkspaceRuntimesForTests()
    clearBusinessSpecsForTests()
    clearProductionLaunchJobsForTests()
    clearExecutionPlansForTests()
    server = createServer(async (req, res) => {
      const url = req.url || '/'
      const live = url.match(/^\/live\/([^/]+)\/?(.*)$/)
      if (live) {
        const file = await readLiveFile(live[1], live[2] || 'index.html')
        if (!file) {
          res.statusCode = 404
          res.end('Not found')
          return
        }
        res.statusCode = 200
        res.setHeader('content-type', file.contentType)
        res.end(file.body)
        return
      }
      if (url === '/' || url.startsWith('/live/')) {
        res.statusCode = 200
        res.end('<html>live</html>')
        return
      }
      res.statusCode = 404
      res.end('no')
    })
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
    const addr = server.address() as AddressInfo
    publicBase = `http://127.0.0.1:${addr.port}`
    process.env.INDOBASE_LAUNCH_PUBLIC_URL = publicBase
  })

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      if (!server) return resolve()
      server.close((err) => (err ? reject(err) : resolve()))
    })
    server = null
    await rm(launchDir, { recursive: true, force: true })
    await rm(jobDir, { recursive: true, force: true })
    delete process.env.INDOBASE_LAUNCH_ROOT
    delete process.env.INDOBASE_LAUNCH_PUBLIC_URL
    delete process.env.INDOBASE_PRODUCTION_JOB_DIR
    clearWorkspaceRuntimesForTests()
    clearBusinessSpecsForTests()
    clearProductionLaunchJobsForTests()
    clearExecutionPlansForTests()
  })

  it('A: new workspace starts with no runtime', () => {
    assert.equal(getWorkspaceRuntime(session.projectRef), null)
    assert.equal(getBusinessSpec(session.projectRef), null)
  })

  it('B–I: prompt creates spec, runtime, artifact, reachable preview; no false ready claim', async () => {
    // A already asserted empty. First signed-in prompt.
    const reached = { launchProductionApp: false }
    const turn = await applyOperatorIntent({
      session,
      message: PROMPT,
      guest: false,
      launchDeps: mockLaunchDeps(reached),
    })

    // B prompt creates BusinessSpec
    assert.ok(turn.spec)
    assert.equal(turn.spec.businessName, 'UrbanThread')
    assert.equal(turn.spec.businessType, 'ecommerce')
    assert.equal(turn.spec.catalog.verticalId, 'sneakers')
    assert.match(turn.spec.visualStyle, /premium/)

    // C BusinessSpec persists
    const stored = getBusinessSpec(session.projectRef)
    assert.equal(stored?.businessName, 'UrbanThread')
    assert.equal(stored?.catalog.verticalId, 'sneakers')

    // D Runtime is created
    const runtime = getWorkspaceRuntime(session.projectRef)
    assert.ok(runtime)
    assert.ok(runtime.plan)
    assert.equal(runtime.plan.appType, 'ecommerce')
    assert.ok(runtime.lastCommandId)

    // E runtime.spec becomes non-null
    assert.ok(runtime.spec)
    assert.equal(runtime.spec.businessName, 'UrbanThread')
    assert.notEqual(turn.businessRuntime.spec, null)
    assert.equal(turn.businessRuntime.spec?.verticalId, 'sneakers')

    // F Build produces artifact
    assert.ok(runtime.artifactHtml?.includes('<html') || runtime.artifactFiles?.['index.html'])
    assert.ok(runtime.preview.artifactRef)
    assert.ok(runtime.preview.contentHash)
    assert.match(runtime.artifactFiles?.['metadata.json'] || '', /UrbanThread/)
    assert.match(runtime.artifactFiles?.['metadata.json'] || '', /sneakers/)
    const disk = await readLiveFile(session.projectRef, 'index.html')
    assert.ok(disk)
    assert.match(disk.body.toString('utf8'), /UrbanThread/)

    // G Preview becomes ready
    assert.equal(runtime.preview.status, 'ready')
    assert.ok(runtime.preview.url)
    assert.equal(turn.businessRuntime.preview.status, 'ready')

    // H Preview URL actually responds (HTTP probe)
    assert.equal(runtime.preview.httpOk, true)
    const probed = await fetch(runtime.preview.url!)
    assert.equal(probed.ok, true)
    assert.match(await probed.text(), /UrbanThread/)

    // I Agent cannot claim preview ready before H — empty state forbids it
    const emptyTurn = toBusinessRuntimeState({
      projectState: 'empty',
      previewStatus: 'absent',
      previewUrl: null,
      liveUrl: null,
      catalogReady: false,
    })
    assert.ok(detectFabricatedClaims('Your store is ready. Everything is ready.', emptyTurn).includes('preview'))
    const sanitized = verifyNarration('Your store is ready.', emptyTurn)
    assert.doesNotMatch(sanitized, /store is ready/i)
    assert.equal(detectFabricatedClaims('Preview is ready for UrbanThread.', turn.businessRuntime).length, 0)

    // First “Launch a … store” is BUILD/preview only — never production LIVE.
    assert.equal(reached.launchProductionApp, false)
    assert.equal(turn.turnClass, 'build')
    assert.equal(turn.intent, 'create_business')
    assert.equal(turn.businessRuntime.live.isLive, false)
    assert.equal(Boolean(turn.launch?.claim_live), false)
    assert.ok(!turn.plan?.steps.some((s) => s.command === 'executeProductionLaunchJob'))
    assert.notEqual(turn.spec?.businessName, 'your business')
  })

  it('J–N: Launch invokes launchProductionApp path; live URL required before LIVE speech', async () => {
    await applyOperatorIntent({
      session,
      message: PROMPT,
      guest: false,
      launchDeps: mockLaunchDeps({ launchProductionApp: false }),
    })
    const reached = { launchProductionApp: false }
    const launchTurn = await applyOperatorIntent({
      session,
      message: 'Go Live — call launchProductionApp for UrbanThread',
      guest: false,
      launchDeps: mockLaunchDeps(reached),
    })

    // J existing execution path (runtime.launch command + production job)
    assert.equal(launchTurn.intent, 'launch_production')
    assert.ok(launchTurn.launch)
    assert.ok(launchTurn.commandId)
    const cmd = launchCommandForIntent(session.projectRef, launchTurn.spec!)
    assert.equal(cmd.kind, 'runtime.launch')
    assert.equal((cmd.payload as { tool?: string }).tool, 'launchProductionApp')

    // K launchProductionApp is actually reached (deploy adapter of the job)
    assert.equal(reached.launchProductionApp, true)

    // L Production job becomes live
    assert.equal(launchTurn.launch?.ok, true)
    assert.equal(launchTurn.launch?.job.status, 'live')
    assert.equal(launchTurn.launch?.claim_live, true)

    // M live.url exists and responds
    assert.equal(launchTurn.launch?.url, 'https://urbanthread-ftu.sites.indobase.in')
    const liveProbe = await fetch(publicBase)
    assert.equal(liveProbe.ok, true)

    // N Agent cannot claim live before M
    const beforeLive = toBusinessRuntimeState({
      projectState: 'preview_ready',
      previewStatus: 'ready',
      previewUrl: `${publicBase}/live/${session.projectRef}/`,
      liveUrl: null,
      catalogReady: false,
    })
    assert.ok(detectFabricatedClaims('Your store is now live at https://fake.example', beforeLive).includes('live'))
    assert.doesNotMatch(sanitizeAgentNarration('Your store is now live.', beforeLive), /now live/i)
  })

  it('O–Q: capability + BusinessRuntimeState + BusinessSnapshot', async () => {
    const turn = await applyOperatorIntent({
      session,
      message: PROMPT,
      guest: false,
      launchDeps: mockLaunchDeps({ launchProductionApp: false }),
    })
    // O Capability cannot be claimed ready without authoritative state
    assert.ok(
      detectFabricatedClaims('Customer database enabled.', turn.businessRuntime).includes('capability'),
    )
    assert.doesNotMatch(
      verifyNarration('Customer database enabled.', turn.businessRuntime),
      /Customer database enabled/i,
    )

    // P BusinessRuntimeState reflects all transitions
    assert.equal(turn.businessRuntime.spec?.businessName, 'UrbanThread')
    assert.equal(turn.businessRuntime.preview.status, 'ready')
    assert.ok(turn.runtime.events.some((e) => e.kind === 'runtime.spec'))
    assert.ok(turn.runtime.events.some((e) => e.kind.includes('preview')))

    // Q Agent can answer business questions from BusinessSnapshot
    const withOrders = toBusinessRuntimeState({
      projectState: 'live',
      previewStatus: 'ready',
      previewUrl: 'https://urbanthread-ftu.sites.indobase.in',
      liveUrl: 'https://urbanthread-ftu.sites.indobase.in',
      catalogReady: true,
      spec: turn.spec,
      snapshot: {
        products: [{ id: 'apex-runner', name: 'Apex Runner', priceMinor: 1299900 }],
        orders: [{ id: 'ord_1', orderNumber: '1042', status: 'paid', amount_minor: 1299900 }],
      },
    })
    assert.equal(withOrders.orders[0]?.orderNumber, '1042')
    assert.match(
      withOrders.products.map((p) => p.name).join(' '),
      /Apex Runner/,
    )
    assert.equal(detectFabricatedClaims('Orders are available.', withOrders).includes('orders'), false)
  })

  it('BUILD turn: conductor owns generation; agent must not rebuild', async () => {
    const turn = await applyOperatorIntent({
      session,
      message: BUILD_PROMPT,
      guest: false,
      launchDeps: mockLaunchDeps({ launchProductionApp: false }),
    })
    assert.equal(turn.turnClass, 'build')
    assert.equal(turnClassForIntent(turn.intent), 'build')
    assert.equal(turn.spec?.businessName, 'UrbanThread')
    assert.match(turn.operatorMessage, /Preview is ready for UrbanThread/)
    assert.doesNotMatch(turn.operatorMessage, /your business/i)
    assert.match(turn.agentContext, /TURN_CLASS=build/)
    assert.match(turn.agentContext, /OWNER=conductor/)
    assert.match(turn.agentContext, /Do not call tools/)
    assert.match(turn.agentContext, /Speak the brand as UrbanThread/)
    assert.equal(turn.launch, null)
  })

  it('MODIFY turn: command system owns mutation; operate does not reuse the build reply', async () => {
    await applyOperatorIntent({
      session,
      message: BUILD_PROMPT,
      guest: false,
      launchDeps: mockLaunchDeps({ launchProductionApp: false }),
    })
    const edited = await applyOperatorIntent({
      session,
      message: 'Change the hero headline to Midnight drops',
      guest: false,
    })
    assert.equal(edited.turnClass, 'modify')
    assert.match(edited.operatorMessage, /Midnight drops/)
    assert.doesNotMatch(edited.operatorMessage, /Preview is ready/)
    assert.match(edited.agentContext, /TURN_CLASS=modify/)
    assert.match(edited.agentContext, /OWNER=command/)
    assert.doesNotMatch(edited.agentContext, /OWNER=conductor/)
    assert.match(edited.agentContext, /Subsequent modify turns still run/)

    const orders = await applyOperatorIntent({
      session,
      message: 'Show my orders',
      guest: false,
      snapshot: {
        products: [{ id: 'apex-runner', name: 'Apex Runner', priceMinor: 1299900 }],
        orders: [
          {
            id: 'ord_new',
            orderNumber: '1043',
            status: 'pending',
            amount_minor: 1299900,
            customer_name: 'Priya Shopper',
            items: 'Apex Runner',
          },
        ],
      },
    })
    assert.equal(orders.turnClass, 'operate')
    assert.match(orders.operatorMessage, /1043/)
    assert.match(orders.operatorMessage, /Priya Shopper/)
    assert.doesNotMatch(orders.operatorMessage, /Preview is ready/)
    assert.match(orders.agentContext, /TURN_CLASS=operate/)
    assert.match(orders.agentContext, /OWNER=BusinessRuntimeState/)
    assert.doesNotMatch(orders.agentContext, /Do not call tools/)
  })

  it('guest begin-turn does not execute; pending intent survives', async () => {
    const guest = await applyOperatorIntent({ session, message: PROMPT, guest: true })
    assert.equal(getBusinessSpec(session.projectRef), null)
    assert.equal(guest.runtime.spec, null)
    const afterAuth = await applyOperatorIntent({
      session,
      message: '',
      guest: false,
      launchDeps: mockLaunchDeps({ launchProductionApp: false }),
    })
    assert.equal(afterAuth.spec?.businessName, 'UrbanThread')
    assert.equal(afterAuth.runtime.preview.status, 'ready')
  })

  it('OTP / auth noise after verify still uses pending UrbanThread intent', async () => {
    await applyOperatorIntent({ session, message: PROMPT, guest: true })
    const afterOtp = await applyOperatorIntent({
      session,
      message: '809952',
      guest: false,
      launchDeps: mockLaunchDeps({ launchProductionApp: false }),
    })
    assert.equal(afterOtp.spec?.businessName, 'UrbanThread')
    assert.notEqual(afterOtp.spec?.businessName, 'your business')
    assert.equal(afterOtp.runtime.preview.status, 'ready')
  })

  it('agent OTP verify without cookie still carries UrbanThread onto the new workspace', async () => {
    const guestSession: Session = {
      ...session,
      projectRef: 'draft_uat_guest',
      cfosBindProjectRef: 'draft_uat_guest',
    }
    await applyOperatorIntent({ session: guestSession, message: PROMPT, guest: true })
    const moved = takePendingAcrossAuth([
      guestSession.projectRef,
      `bind:${guestSession.cfosBindProjectRef}`,
      `agent:${deriveAgentUsername(guestSession.gotrueId, guestSession.projectRef)}`,
    ])
    assert.equal(moved, PROMPT)
    const signedIn: Session = { ...session, projectRef: 'uatu62484b2e5c' }
    rememberPendingIntent(signedIn.projectRef, moved || '')
    const turn = await applyOperatorIntent({
      session: signedIn,
      message: 'Please show me the store',
      guest: false,
      launchDeps: mockLaunchDeps({ launchProductionApp: false }),
    })
    assert.equal(turn.spec?.businessName, 'UrbanThread')
    assert.equal(turn.spec?.catalog.verticalId, 'sneakers')
    assert.notEqual(turn.spec?.businessName, 'your business')
  })

  it('Go Live after pending create keeps UrbanThread, not the workspace placeholder', async () => {
    const fresh: Session = { ...session, projectRef: 'utpending99aa' }
    await applyOperatorIntent({ session: fresh, message: PROMPT, guest: true })
    const preview = await applyOperatorIntent({
      session: fresh,
      message: 'Please show me the store',
      guest: false,
      launchDeps: mockLaunchDeps({ launchProductionApp: false }),
    })
    assert.equal(preview.spec?.businessName, 'UrbanThread')
    assert.equal(preview.runtime.preview.status, 'ready')
    const live = await applyOperatorIntent({
      session: fresh,
      message: 'Launch my store on Indobase now.',
      guest: false,
      launchDeps: mockLaunchDeps({ launchProductionApp: true }),
    })
    assert.equal(live.intent, 'launch_production')
    assert.equal(live.spec?.businessName, 'UrbanThread')
    assert.equal(live.launch?.ok, true)
  })

  it('classifies UrbanThread create vs Go Live', () => {
    assert.equal(classifyOperatorIntent(PROMPT, null), 'create_business')
    assert.equal(classifyOperatorIntent(BUILD_PROMPT, null), 'create_business')
    assert.equal(classifyOperatorIntent('Show my orders', null), 'operate')
    assert.equal(
      classifyOperatorIntent('What can visitors do on this website?', {
        spec: { businessName: 'Harbor Studio', businessType: 'landing' },
      } as never),
      'operate',
    )
    assert.equal(
      classifyOperatorIntent('Launch my store on Indobase now.', null),
      'launch_production',
    )
    assert.equal(classifyOperatorIntent('Launch my website on Indobase now.', null), 'launch_production')
    assert.equal(classifyOperatorIntent('Change the hero headline to Midnight drops', null), 'preview_edit')
    assert.equal(
      classifyOperatorIntent('Go Live — call launchProductionApp for UrbanThread', null),
      'launch_production',
    )
    assert.equal(
      classifyOperatorIntent(
        '<<<INDOBASE_RUNTIME>>>\npreview.status=ready\n<<<END_INDOBASE_RUNTIME>>>\n\nPREVIEW_EDIT\ntarget: section / hero (Hero)\nrequest: Change the hero headline to Midnight drops',
        null,
      ),
      'preview_edit',
    )
    assert.equal(
      classifyOperatorIntent('Add a red Nike-style running shoe at ₹8,999 with sizes 7–11.', {
        spec: { businessName: 'UrbanThread', businessType: 'ecommerce' },
      } as never),
      'operate',
    )
    assert.equal(classifyOperatorIntent('Increase prices by 10%', null), 'operate')
    assert.equal(classifyOperatorIntent('Which products are low stock?', null), 'operate')
    assert.equal(
      classifyOperatorIntent('Build a tutoring app called TutorDesk', null),
      'create_business',
    )
    assert.equal(
      classifyOperatorIntent('Launch a photography studio website called Harbor Studio', null),
      'create_business',
    )
    assert.equal(
      classifyOperatorIntent('Launch a premium outdoor gear store called CedarPeak', null),
      'create_business',
    )
    assert.equal(classifyOperatorIntent('Add Ridge Pack Extra for ₹8999.', null), 'operate')
    assert.equal(classifyOperatorIntent('change Ridge Pack Extra price to ₹9999', null), 'operate')
    assert.equal(classifyOperatorIntent('set Ridge Pack Extra stock to 12', null), 'operate')
    assert.equal(classifyOperatorIntent('create collection Trail Packs', null), 'operate')
    assert.equal(classifyOperatorIntent('show my products', null), 'operate')
    assert.equal(classifyOperatorIntent('mark order ORD-1 fulfilled', null), 'operate')
  })

  it('Ask AI / SCREEN includes snapshot orders in begin-turn agentContext', async () => {
    await applyOperatorIntent({
      session,
      message: PROMPT,
      guest: false,
      launchDeps: mockLaunchDeps({ launchProductionApp: false }),
    })
    const turn = await applyOperatorIntent({
      session,
      message: 'SCREEN\nsection: orders\nentity: zvka8renspuyufi\nrequest: Show me order #zvka8renspuyufi',
      guest: false,
      snapshot: {
        products: [{ id: 'thread-one', name: 'Thread One/Bone', priceMinor: 18900 }],
        orders: [
          {
            id: 'zvka8renspuyufi',
            orderNumber: 'zvka8renspuyufi',
            status: 'pending',
            amount_minor: 18900,
            email: 'priya@shopper.test',
            customer_name: 'Priya Shopper',
            items: 'Thread One/Bone',
          },
        ],
      },
    })
    assert.equal(turn.intent, 'operate')
    assert.equal(turn.businessRuntime.orders[0]?.id, 'zvka8renspuyufi')
    assert.equal(turn.businessRuntime.orders[0]?.customerName, 'Priya Shopper')
    assert.match(turn.agentContext, /#zvka8renspuyufi/)
    assert.match(turn.agentContext, /Priya Shopper/)
    assert.match(turn.agentContext, /Thread One\/Bone/)
    assert.match(turn.agentContext, /FORBIDDEN: do not say commerce admin/)
    assert.equal(isForbiddenAgentClaim(turn.businessRuntime, 'orders-unavailable'), true)
    assert.ok(
      detectFabricatedClaims(
        'The commerce admin service isn’t available. No order data was returned.',
        turn.businessRuntime,
      ).includes('orders-unavailable'),
    )
  })

  it('PREVIEW_EDIT is allowed when preview.status=ready', async () => {
    await applyOperatorIntent({
      session,
      message: PROMPT,
      guest: false,
      launchDeps: mockLaunchDeps({ launchProductionApp: false }),
    })
    const turn = await applyOperatorIntent({
      session,
      message:
        'PREVIEW_EDIT\ntarget: section / hero (Hero)\nsource: preview\nintent: rewrite\nrequest: make hero shorter',
      guest: false,
    })
    assert.equal(turn.intent, 'preview_edit')
    assert.equal(turn.runtime.preview.status, 'ready')
    assert.equal(turn.businessRuntime.preview.status, 'ready')
    assert.match(turn.agentContext, /PREVIEW_EDIT is allowed/)
    assert.match(turn.agentContext, /UrbanThread/)
    assert.match(turn.agentContext, /FORBIDDEN: .*(not in this workspace|isn.t currently available)/)
    assert.equal(
      detectFabricatedClaims(
        'That store is not in this workspace and isn’t currently available.',
        turn.businessRuntime,
      ).includes('store-missing'),
      true,
    )
  })

  it('rehydrates spec+preview+orders after in-memory runtime is cleared', async () => {
    const first = await applyOperatorIntent({
      session,
      message: PROMPT,
      guest: false,
      launchDeps: mockLaunchDeps({ launchProductionApp: false }),
    })
    assert.equal(first.runtime.preview.status, 'ready')
    clearWorkspaceRuntimesForTests()
    clearBusinessSpecsForTests()
    assert.equal(getWorkspaceRuntime(session.projectRef), null)

    const turn = await applyOperatorIntent({
      session,
      message: 'SCREEN\nsection: orders\nrequest: Show me order #zvka8renspuyufi',
      guest: false,
      snapshot: {
        products: [{ id: 'thread-one', name: 'Thread One/Bone', priceMinor: 18900 }],
        orders: [
          {
            id: 'zvka8renspuyufi',
            orderNumber: 'zvka8renspuyufi',
            status: 'pending',
            amount_minor: 18900,
            email: 'priya@shopper.test',
            customer_name: 'Priya Shopper',
            items: 'Thread One/Bone',
          },
        ],
      },
      launchStatus: {
        previewReady: true,
        previewUrl: first.runtime.preview.url,
        url: 'https://urbanthread-aaf13e89.sites.indobase.in',
      },
      productionJob: {
        version: 'production-launch-job/v1',
        jobId: 'plj_msrmidq1_1f5ef0b3',
        projectRef: session.projectRef,
        gotrueId: session.gotrueId,
        email: session.email || 'op@indobase.in',
        intent: PROMPT,
        production: true,
        appType: 'ecommerce',
        plan: {
          appType: 'ecommerce',
          backendRequired: true,
          authRequired: true,
          databaseRequired: true,
          commerceRequired: true,
          source: 'explicit',
        },
        contract: { appType: 'ecommerce' } as never,
        status: 'live',
        stages: [],
        html: first.runtime.artifactHtml,
        files: first.runtime.artifactFiles,
        title: 'your business',
        brand: 'your business',
        vertical: 'sneakers',
        url: 'https://urbanthread-aaf13e89.sites.indobase.in',
        claim_live: true,
        repairAttempts: 0,
        failures: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    })
    assert.equal(turn.spec?.businessName, 'UrbanThread')
    assert.equal(turn.runtime.preview.status, 'ready')
    assert.equal(turn.businessRuntime.orders[0]?.id, 'zvka8renspuyufi')
    assert.match(turn.agentContext, /#zvka8renspuyufi/)
    assert.match(turn.agentContext, /Priya Shopper/)
  })

  it('PREVIEW_EDIT persists the hero headline across reload', async () => {
    await applyOperatorIntent({
      session,
      message: PROMPT,
      guest: false,
      launchDeps: mockLaunchDeps({ launchProductionApp: false }),
    })
    const headline = 'Premium Sneakers. Built to Move.'
    const turn = await applyOperatorIntent({
      session,
      message: `PREVIEW_EDIT\ntarget: section / hero (Hero)\nsource: preview\nintent: rewrite\nrequest: Change the hero headline to \`${headline}\``,
      guest: false,
    })
    assert.equal(turn.intent, 'preview_edit')
    assert.match(turn.operatorMessage, /Premium Sneakers\. Built to Move\./)
    assert.match(turn.runtime.artifactHtml || '', /Premium Sneakers\. Built to Move\./)
    const disk = await readLiveFile(session.projectRef, 'index.html')
    assert.match(disk?.body.toString('utf8') || '', /Premium Sneakers\. Built to Move\./)

    clearWorkspaceRuntimesForTests()
    clearBusinessSpecsForTests()
    const reloaded = await applyOperatorIntent({
      session,
      message: 'What is the hero headline?',
      guest: false,
    })
    assert.match(reloaded.runtime.artifactHtml || '', /Premium Sneakers\. Built to Move\./)
    const disk2 = await readLiveFile(session.projectRef, 'index.html')
    assert.match(disk2?.body.toString('utf8') || '', /Premium Sneakers\. Built to Move\./)
  })

  it('make hero more premium persists a default headline', async () => {
    await applyOperatorIntent({
      session,
      message: PROMPT,
      guest: false,
      launchDeps: mockLaunchDeps({ launchProductionApp: false }),
    })
    const turn = await applyOperatorIntent({
      session,
      message: 'make hero more premium',
      guest: false,
    })
    assert.equal(turn.intent, 'preview_edit')
    assert.match(turn.operatorMessage, /Premium sneakers\. Built to move\./)
    assert.match(turn.runtime.artifactHtml || '', /Premium sneakers\. Built to move\./)
  })

  it('PREVIEW_EDIT persists an unquoted hero headline', async () => {
    await applyOperatorIntent({
      session,
      message: PROMPT,
      guest: false,
      launchDeps: mockLaunchDeps({ launchProductionApp: false }),
    })
    const turn = await applyOperatorIntent({
      session,
      message:
        'PREVIEW_EDIT\ntarget: section / hero (Hero)\nsource: preview\nintent: rewrite\nrequest: Change the hero headline to Midnight drops',
      guest: false,
    })
    assert.equal(turn.intent, 'preview_edit')
    assert.match(turn.operatorMessage, /Midnight drops/)
    assert.match(turn.runtime.artifactHtml || '', /Midnight drops/)
    assert.doesNotMatch(turn.operatorMessage, /isn.t available/i)
  })

  it('fresh snapshot replaces a stale order count on the next turn', async () => {
    await applyOperatorIntent({
      session,
      message: PROMPT,
      guest: false,
      launchDeps: mockLaunchDeps({ launchProductionApp: false }),
    })
    const first = await applyOperatorIntent({
      session,
      message: 'What orders do I have?',
      guest: false,
      snapshot: {
        products: [],
        orders: [{ id: 'zvka8renspuyufi', status: 'pending', amount_minor: 18900 }],
      },
    })
    assert.equal(first.businessRuntime.orders.length, 1)
    const second = await applyOperatorIntent({
      session,
      message: 'How many orders do I have now?',
      guest: false,
      snapshot: {
        products: [],
        orders: [
          { id: 'zvka8renspuyufi', status: 'pending', amount_minor: 18900 },
          { id: 'order_two', status: 'pending', amount_minor: 9900 },
        ],
      },
    })
    assert.equal(second.businessRuntime.orders.length, 2)
    assert.match(second.agentContext, /#order_two/)
    assert.match(second.agentContext, /#zvka8renspuyufi/)
  })

  it('workspace B cannot read A’s spec, artifact, or orders', async () => {
    await applyOperatorIntent({
      session,
      message: PROMPT,
      guest: false,
      launchDeps: mockLaunchDeps({ launchProductionApp: false }),
    })
    const other: Session = {
      ...session,
      gotrueId: 'user-b',
      email: 'b@indobase.in',
      projectRef: 'otherwsb1',
      projectName: 'Other',
    }
    const turn = await applyOperatorIntent({
      session: other,
      message: 'Show me order zvka8renspuyufi',
      guest: false,
      snapshot: { products: [], orders: [] },
    })
    assert.notEqual(turn.spec?.businessName, 'UrbanThread')
    assert.equal(turn.businessRuntime.orders.length, 0)
    assert.doesNotMatch(turn.agentContext, /#zvka8renspuyufi/)
    assert.equal(turn.businessRuntime.workspace.ref, 'otherwsb1')
  })

  it('Add a product mutates catalog and BusinessRuntimeState.products', async () => {
    const catalogDeps = createMemoryStoreCommandDeps()
    await applyOperatorIntent({
      session,
      message: PROMPT,
      guest: false,
      launchDeps: mockLaunchDeps({ launchProductionApp: false }),
      catalogDeps,
    })
    const turn = await applyOperatorIntent({
      session,
      message: 'Add a red Nike-style running shoe at ₹8,999 with sizes 7–11.',
      guest: false,
      catalogDeps,
    })
    assert.equal(turn.intent, 'operate')
    assert.equal(turn.turnClass, 'operate')
    const added = turn.businessRuntime.products.find((p) => /running shoe/i.test(p.name))
    assert.ok(added)
    assert.equal(added?.priceMinor, 899900)
    assert.equal(turn.businessRuntime.catalog.productCount, 1)
    assert.match(turn.operatorMessage, /Added/)
    assert.doesNotMatch(turn.operatorMessage, /PocketBase|Go to Products/i)
    assert.match(turn.agentContext, /catalog\.productCount: 1/)
    assert.match(turn.runtime.artifactHtml || '', /running shoe/i)
    assert.match(turn.runtime.artifactHtml || '', /899900/)
    const projected = await readLiveFile(session.projectRef, 'index.html')
    assert.match(projected?.body.toString('utf8') || '', /running shoe/i)
  })

  it('session A cannot mutate workspace B catalog (403)', async () => {
    const catalogDeps = createMemoryStoreCommandDeps()
    await applyOperatorIntent({
      session,
      message: PROMPT,
      guest: false,
      launchDeps: mockLaunchDeps({ launchProductionApp: false }),
      catalogDeps,
    })
    await applyOperatorIntent({
      session,
      message: 'Add a product called Apex Runner at ₹1,299',
      guest: false,
      catalogDeps,
    })
    const other: Session = {
      ...session,
      gotrueId: 'user-b',
      email: 'b@indobase.in',
      projectRef: 'otherwsb1',
    }
    const denied = await executeStoreCommand({
      session,
      requestedProjectRef: other.projectRef,
      message: 'Add a product called Leak at ₹100',
      deps: catalogDeps,
    })
    assert.equal(denied.status, 403)
    assert.equal(denied.ok, false)
    const bTurn = await applyOperatorIntent({
      session: other,
      message: 'Add a product called Leak at ₹100',
      guest: false,
      catalogDeps,
    })
    assert.equal(
      bTurn.businessRuntime.products.some((p) => /apex/i.test(p.name)),
      false,
    )
    assert.equal(
      bTurn.businessRuntime.products.some((p) => /leak/i.test(p.name)),
      true,
    )
    assert.equal(bTurn.businessRuntime.workspace.ref, 'otherwsb1')
  })

  it('explicit Launch my store after preview READY dispatches executeProductionLaunchJob', async () => {
    const preview = await applyOperatorIntent({
      session,
      message: PROMPT,
      guest: false,
      launchDeps: mockLaunchDeps({ launchProductionApp: false }),
    })
    assert.equal(preview.turnClass, 'build')
    assert.equal(preview.runtime.preview.status, 'ready')
    assert.ok(!preview.plan?.steps.some((s) => s.command === 'executeProductionLaunchJob'))
    const reached = { launchProductionApp: false }
    const launchTurn = await applyOperatorIntent({
      session,
      message: 'Launch my store on Indobase now.',
      guest: false,
      launchDeps: mockLaunchDeps(reached),
    })
    assert.equal(launchTurn.intent, 'launch_production')
    assert.equal(launchTurn.turnClass, 'launch')
    assert.ok(launchTurn.plan?.steps.some((s) => s.command === 'executeProductionLaunchJob'))
    assert.equal(reached.launchProductionApp, true)
    assert.doesNotMatch(launchTurn.operatorMessage, /truthfully|launchBusiness|placeTestShopOrder|do not restart/i)
    const refused = verifyNarration(
      "I can't truthfully confirm a production launch. Please call launchBusiness.",
      launchTurn.businessRuntime,
    )
    assert.doesNotMatch(refused, /truthfully|launchBusiness/i)
  })

  it('vague ordering-site ask shows niche CHOICES instead of inventing a brand', async () => {
    const vague = 'I want to launch an ordering site. Infer the rest and start building'
    const turn = await applyOperatorIntent({
      session: { ...session, projectRef: 'vagueorder01' },
      message: vague,
      guest: false,
      launchDeps: mockLaunchDeps({ launchProductionApp: false }),
    })
    assert.equal(turn.turnClass, 'other')
    assert.notEqual(turn.runtime.preview.status, 'ready')
    assert.match(turn.operatorMessage, /What will your store sell/)
    assert.match(turn.operatorMessage, /INDOBASE_CHOICES|INDOBASE_FOLLOWUPS/)
    assert.doesNotMatch(turn.operatorMessage, /Circuit Nest/i)
  })

  it('niche card after a vague ask starts BUILD', async () => {
    const vagueSess: Session = { ...session, projectRef: 'nichepick01aa' }
    await applyOperatorIntent({
      session: vagueSess,
      message: 'I want to launch an ordering site. Infer the rest and start building',
      guest: false,
      launchDeps: mockLaunchDeps({ launchProductionApp: false }),
    })
    const built = await applyOperatorIntent({
      session: vagueSess,
      message:
        'Niche Apparel — invent brand + aesthetic, build a preview storefront with localStorage cart (vertical=apparel).',
      guest: false,
      launchDeps: mockLaunchDeps({ launchProductionApp: false }),
    })
    assert.equal(built.turnClass, 'build')
    assert.equal(built.spec?.catalog.verticalId, 'apparel')
    assert.notEqual(built.spec?.businessName, 'Circuit Nest')
  })

  it('first complete-shop ask stays BUILD and does not skip to LIVE', async () => {
    const turn = await applyOperatorIntent({
      session: { ...session, projectRef: 'buildshopaa11bb' },
      message: 'Build me a complete online shop for apparel',
      guest: false,
      launchDeps: mockLaunchDeps({ launchProductionApp: false }),
    })
    assert.equal(turn.turnClass, 'build')
    assert.ok(!turn.plan?.steps.some((s) => s.command === 'executeProductionLaunchJob'))
    assert.equal(Boolean(turn.launch?.claim_live), false)
  })
})
