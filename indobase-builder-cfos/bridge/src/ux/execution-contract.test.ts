import assert from 'node:assert/strict'
import { createServer, type AddressInfo } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { Session } from '../auth.ts'
import { detectFabricatedClaims, sanitizeAgentNarration } from '@indobase/platform'
import { clearProductionLaunchJobsForTests } from '../production-launch/index.ts'
import { readLiveFile } from '../static-launch.ts'
import {
  applyOperatorIntent,
  classifyOperatorIntent,
  launchCommandForIntent,
  verifyNarration,
} from './execution-contract.ts'
import {
  clearWorkspaceRuntimesForTests,
  getWorkspaceRuntime,
} from './runtime-store.ts'
import { clearBusinessSpecsForTests, getBusinessSpec } from './business-spec.ts'
import { toBusinessRuntimeState } from './agent-truth.ts'

const session: Session = {
  gotrueId: 'user-ftu',
  email: 'op@indobase.in',
  projectRef: 'rosh76e90375b6',
  orgSlug: 'acme',
  projectName: 'Workspace',
  studioUrl: 'https://studio.indobase.in',
}

const PROMPT = 'Launch a premium sneaker store called UrbanThread'

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
  })

  it('A: new workspace starts with no runtime', () => {
    assert.equal(getWorkspaceRuntime(session.projectRef), null)
    assert.equal(getBusinessSpec(session.projectRef), null)
  })

  it('B–I: prompt creates spec, runtime, artifact, reachable preview; no false ready claim', async () => {
    // A already asserted empty. First signed-in prompt.
    const turn = await applyOperatorIntent({ session, message: PROMPT, guest: false })

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
  })

  it('J–N: Launch invokes launchProductionApp path; live URL required before LIVE speech', async () => {
    await applyOperatorIntent({ session, message: PROMPT, guest: false })
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
    const turn = await applyOperatorIntent({ session, message: PROMPT, guest: false })
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

  it('guest begin-turn does not execute; pending intent survives', async () => {
    const guest = await applyOperatorIntent({ session, message: PROMPT, guest: true })
    assert.equal(getBusinessSpec(session.projectRef), null)
    assert.equal(guest.runtime.spec, null)
    const afterAuth = await applyOperatorIntent({ session, message: '', guest: false })
    assert.equal(afterAuth.spec?.businessName, 'UrbanThread')
    assert.equal(afterAuth.runtime.preview.status, 'ready')
  })

  it('classifies UrbanThread create vs Go Live', () => {
    assert.equal(classifyOperatorIntent(PROMPT, null), 'create_business')
    assert.equal(
      classifyOperatorIntent('Go Live — call launchProductionApp for UrbanThread', null),
      'launch_production',
    )
  })
})
