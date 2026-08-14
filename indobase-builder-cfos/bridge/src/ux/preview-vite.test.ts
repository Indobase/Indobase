import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { Session } from '../auth.ts'
import {
  PRODUCTION_LAUNCH_JOB_VERSION,
  clearProductionLaunchJobsForTests,
  getLatestProductionLaunchJob,
  planProductionApp,
  rememberProductionLaunchJob,
  resolveProductionContract,
} from '../production-launch/index.ts'
import { readLiveFile } from '../static-launch.ts'
import { clearBusinessSpecsForTests, inferBusinessSpec } from './business-spec.ts'
import { clearExecutionPlansForTests } from './execution-store.ts'
import { buildExecutionPlan } from './execution-plan.ts'
import { runBuild } from './executors/build.ts'
import { runModify } from './executors/modify.ts'
import { persistPreviewHtml } from './executors/preview-persist.ts'
import { materializePreview } from './preview-artifact.ts'
import {
  clearWorkspaceRuntimesForTests,
  emptyPersistedRuntime,
  getWorkspaceRuntime,
  rememberWorkspaceRuntime,
} from './runtime-store.ts'

const session: Session = {
  gotrueId: 'user-vite-preview',
  email: 'op@indobase.in',
  projectRef: 'proj_vite_preview',
  orgSlug: 'acme',
  projectName: 'Workspace',
  studioUrl: 'https://studio.indobase.in',
}

function viteFiles(appBody: string) {
  return {
    'package.json': JSON.stringify({
      name: 'site',
      scripts: { build: 'vite build' },
      dependencies: { react: '19.0.0', 'react-dom': '19.0.0' },
      devDependencies: { vite: '6.0.0' },
    }),
    'index.html': '<div id="root"></div><script type="module" src="/src/main.tsx"></script>',
    'src/main.tsx': 'export {}',
    'src/App.tsx': appBody,
  }
}

describe('BUILD preview compiles Vite trees', () => {
  let launchDir = ''

  beforeEach(async () => {
    launchDir = await mkdtemp(path.join(os.tmpdir(), 'preview-vite-'))
    process.env.INDOBASE_LAUNCH_ROOT = launchDir
    process.env.INDOBASE_PRODUCTION_JOB_DIR = launchDir
    clearWorkspaceRuntimesForTests()
    clearBusinessSpecsForTests()
    clearProductionLaunchJobsForTests()
    clearExecutionPlansForTests()
  })

  afterEach(async () => {
    await rm(launchDir, { recursive: true, force: true })
    delete process.env.INDOBASE_LAUNCH_ROOT
    delete process.env.INDOBASE_PRODUCTION_JOB_DIR
    clearWorkspaceRuntimesForTests()
    clearBusinessSpecsForTests()
    clearProductionLaunchJobsForTests()
    clearExecutionPlansForTests()
  })

  it('materializePreview compiles a Vite tree and hosts dist, not the canned shell', async () => {
    const spec = inferBusinessSpec('Launch a premium sneaker store called UrbanThread')
    let built = false
    const compiledHtml =
      '<!DOCTYPE html><html><body><h1>Flour & Co</h1><script src="./assets/app.js"></script></body></html>'
    const result = await materializePreview({
      projectRef: session.projectRef,
      spec,
      probe: async () => true,
      files: viteFiles('export default function App(){return <h1>Flour & Co</h1>}'),
      buildReact: async ({ files }) => {
        built = true
        assert.match(files['src/App.tsx'] || '', /Flour/)
        return {
          ok: true,
          html: compiledHtml,
          files: { 'index.html': compiledHtml, 'assets/app.js': 'console.log("ok")' },
          message: 'compiled',
        }
      },
    })
    assert.equal(built, true)
    assert.equal(result.ok, true)
    assert.equal(result.status, 'ready')
    assert.match(result.html, /Flour & Co/)
    assert.doesNotMatch(result.html, /Circuit Nest/)
    assert.doesNotMatch(result.html, /UrbanThread/)
    assert.ok(result.files['assets/app.js'])
    const disk = await readLiveFile(session.projectRef, 'index.html')
    assert.match(disk?.body.toString('utf8') || '', /Flour & Co/)
    const asset = await readLiveFile(session.projectRef, 'assets/app.js')
    assert.match(asset?.body.toString('utf8') || '', /console\.log/)
  })

  it('does not mark preview ready when vite build fails', async () => {
    const spec = inferBusinessSpec('Launch a premium sneaker store called UrbanThread')
    const result = await materializePreview({
      projectRef: session.projectRef,
      spec,
      probe: async () => true,
      files: viteFiles('export default function App(){return null}'),
      buildReact: async () => ({ ok: false, message: 'vite build failed: syntax' }),
    })
    assert.equal(result.ok, false)
    assert.equal(result.status, 'failed')
    assert.match(result.message, /react_build_failed/)
    assert.match(result.message, /vite build/)
    const disk = await readLiveFile(session.projectRef, 'index.html')
    assert.equal(disk, null)
  })

  it('runBuild uses workspace Vite files and injected buildReact', async () => {
    const files = viteFiles('export default function App(){return <h1>Agent Bakery</h1>}')
    rememberWorkspaceRuntime({
      ...emptyPersistedRuntime(session.projectRef),
      artifactFiles: files,
    })
    const compiledHtml = '<!DOCTYPE html><html><body><h1>Agent Bakery</h1></body></html>'
    let built = false
    const plan = buildExecutionPlan({
      projectRef: session.projectRef,
      intent: 'create_business',
      turnClass: 'build',
      message: 'Build a bakery site',
    })
    const result = await runBuild(plan, {
      session,
      message: 'Build a bakery site',
      specSource: 'Build a bakery site',
      probe: async () => true,
      launchDeps: {
        buildReact: async () => {
          built = true
          return {
            ok: true,
            html: compiledHtml,
            files: { 'index.html': compiledHtml, 'assets/app.js': '1' },
            message: 'compiled',
          }
        },
      },
      runtime: emptyPersistedRuntime(session.projectRef),
    })
    assert.equal(built, true)
    assert.equal(result.runtime.preview.status, 'ready')
    assert.match(result.runtime.artifactHtml || '', /Agent Bakery/)
    assert.doesNotMatch(result.runtime.artifactHtml || '', /Circuit Nest/)
    assert.match(result.runtime.artifactFiles?.['src/App.tsx'] || '', /Agent Bakery/)
    const disk = await readLiveFile(session.projectRef, 'index.html')
    assert.match(disk?.body.toString('utf8') || '', /Agent Bakery/)
  })

  it('persistPreviewHtml keeps Vite source on the job and writes dist including assets', async () => {
    const plan = planProductionApp({ appType: 'landing', intent: 'bakery' })
    rememberProductionLaunchJob({
      version: PRODUCTION_LAUNCH_JOB_VERSION,
      jobId: 'plj_vite_src',
      projectRef: session.projectRef,
      gotrueId: session.gotrueId,
      email: session.email,
      intent: 'bakery',
      production: true,
      appType: plan.appType,
      plan,
      contract: resolveProductionContract(plan.appType),
      status: 'running',
      stages: [],
      html: '<html><h1>old</h1></html>',
      files: { 'index.html': '<html><h1>old</h1></html>' },
      claim_live: false,
      repairAttempts: 0,
      failures: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    const source = viteFiles('export default function App(){return <h1>Keep Source</h1>}')
    const compiledHtml = '<!DOCTYPE html><html><body><h1>Keep Source</h1></body></html>'
    await persistPreviewHtml({
      session,
      runtime: emptyPersistedRuntime(session.projectRef),
      html: compiledHtml,
      files: source,
      mutation: 'vite',
      eventKind: 'runtime.preview.ready',
      eventMessage: 'compiled',
      launchDeps: {
        buildReact: async () => ({
          ok: true,
          html: compiledHtml,
          files: { 'index.html': compiledHtml, 'assets/app.js': 'ok' },
          message: 'compiled',
        }),
      },
    })
    const job = getLatestProductionLaunchJob(session.projectRef)
    assert.equal(job?.files?.['src/App.tsx']?.includes('Keep Source'), true)
    assert.equal(job?.files?.['package.json']?.includes('vite build'), true)
    const disk = await readLiveFile(session.projectRef, 'index.html')
    assert.match(disk?.body.toString('utf8') || '', /Keep Source/)
    const asset = await readLiveFile(session.projectRef, 'assets/app.js')
    assert.equal(asset?.body.toString('utf8'), 'ok')
  })

  it('persistPreviewHtml keeps dist assets when the incoming tree is already compiled', async () => {
    const plan = planProductionApp({ appType: 'landing', intent: 'bakery' })
    rememberProductionLaunchJob({
      version: PRODUCTION_LAUNCH_JOB_VERSION,
      jobId: 'plj_vite_dist',
      projectRef: session.projectRef,
      gotrueId: session.gotrueId,
      email: session.email,
      intent: 'bakery',
      production: true,
      appType: plan.appType,
      plan,
      contract: resolveProductionContract(plan.appType),
      status: 'running',
      stages: [],
      html: '<html><h1>old</h1></html>',
      files: { 'index.html': '<html><h1>old</h1></html>' },
      claim_live: false,
      repairAttempts: 0,
      failures: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    const html = '<!DOCTYPE html><html><body><h1>Dist Only</h1></body></html>'
    await persistPreviewHtml({
      session,
      runtime: emptyPersistedRuntime(session.projectRef),
      html,
      files: { 'index.html': html, 'assets/app.js': 'dist' },
      mutation: 'dist',
      eventKind: 'runtime.preview.ready',
      eventMessage: 'dist',
    })
    const job = getLatestProductionLaunchJob(session.projectRef)
    assert.equal(job?.files?.['assets/app.js'], 'dist')
    assert.match(job?.files?.['index.html'] || '', /Dist Only/)
    const asset = await readLiveFile(session.projectRef, 'assets/app.js')
    assert.equal(asset?.body.toString('utf8'), 'dist')
  })

  it('MODIFY patches Vite source and recompiles dist', async () => {
    const files = viteFiles('export default function App(){return <h1>Flour & Co</h1>}')
    rememberWorkspaceRuntime({
      ...emptyPersistedRuntime(session.projectRef),
      artifactFiles: files,
      artifactHtml: '<!DOCTYPE html><html><body><h1>Flour & Co</h1></body></html>',
      preview: { status: 'ready', url: '/live/proj_vite_preview/', artifactRef: 'a', contentHash: 'h', httpOk: true },
    })
    const compiledHtml = '<!DOCTYPE html><html><body><h1>Midnight drops</h1></body></html>'
    let sawSource = ''
    const plan = buildExecutionPlan({
      projectRef: session.projectRef,
      intent: 'preview_edit',
      turnClass: 'modify',
      message: 'Change the hero headline to Midnight drops',
    })
    const result = await runModify(plan, {
      session,
      message: 'PREVIEW_EDIT\nrequest: Change the hero headline to Midnight drops',
      specSource: '',
      probe: async () => true,
      runtime: getWorkspaceRuntime(session.projectRef)!,
      launchDeps: {
        buildReact: async ({ files: tree }) => {
          sawSource = tree['src/App.tsx'] || ''
          return {
            ok: true,
            html: compiledHtml,
            files: { 'index.html': compiledHtml, 'assets/app.js': '2' },
            message: 'compiled',
          }
        },
      },
    })
    assert.equal(result.mutated, true)
    assert.match(sawSource, /Midnight drops/)
    assert.match(result.runtime.artifactFiles?.['src/App.tsx'] || '', /Midnight drops/)
    const disk = await readLiveFile(session.projectRef, 'index.html')
    assert.match(disk?.body.toString('utf8') || '', /Midnight drops/)
    const asset = await readLiveFile(session.projectRef, 'assets/app.js')
    assert.equal(asset?.body.toString('utf8'), '2')
  })
})
