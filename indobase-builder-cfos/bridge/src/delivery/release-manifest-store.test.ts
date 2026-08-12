import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'

import {
  clearReleaseManifestsForTests,
  getReleaseManifest,
  rememberReleaseManifest,
} from './release-manifest-store.ts'
import type { ReleaseManifest } from './release-gate.ts'

describe('release-manifest-store durability', () => {
  let dir = ''
  const prevLaunch = process.env.INDOBASE_LAUNCH_ROOT
  const prevDir = process.env.INDOBASE_RELEASE_MANIFEST_DIR
  const prevSha = process.env.GIT_SHA

  afterEach(async () => {
    clearReleaseManifestsForTests()
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
      dir = ''
    }
    if (prevLaunch === undefined) delete process.env.INDOBASE_LAUNCH_ROOT
    else process.env.INDOBASE_LAUNCH_ROOT = prevLaunch
    if (prevDir === undefined) delete process.env.INDOBASE_RELEASE_MANIFEST_DIR
    else process.env.INDOBASE_RELEASE_MANIFEST_DIR = prevDir
    if (prevSha === undefined) delete process.env.GIT_SHA
    else process.env.GIT_SHA = prevSha
  })

  function sample(ref = 'shop01'): ReleaseManifest {
    return {
      projectRef: ref,
      contractVersion: 'ecommerce@1',
      applicationType: 'ecommerce',
      verifierResults: [{ id: 'COMMERCE_ABI_BOUND', ok: true, severity: 'required' }],
      url: `https://${ref}.sites.indobase.in`,
      timestamp: new Date().toISOString(),
      gitSha: 'abc123deadbeef',
      deploy: { lane: 'static', subdomain: ref },
    }
  }

  it('write-through persists JSON under launches/release-manifests', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ib-release-manifest-'))
    process.env.INDOBASE_LAUNCH_ROOT = dir
    clearReleaseManifestsForTests()

    rememberReleaseManifest(sample('persist1'))

    const file = path.join(dir, 'release-manifests', 'persist1.json')
    const raw = await fs.readFile(file, 'utf8')
    const parsed = JSON.parse(raw) as ReleaseManifest
    assert.equal(parsed.projectRef, 'persist1')
    assert.equal(parsed.url, 'https://persist1.sites.indobase.in')
    assert.equal(parsed.gitSha, 'abc123deadbeef')
    assert.equal(parsed.verifierResults[0]?.id, 'COMMERCE_ABI_BOUND')
  })

  it('reads from disk on memory miss (survives clear)', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ib-release-manifest-'))
    process.env.INDOBASE_LAUNCH_ROOT = dir
    clearReleaseManifestsForTests()

    rememberReleaseManifest(sample('diskhit'))
    clearReleaseManifestsForTests()
    assert.equal(getReleaseManifest('diskhit')?.projectRef, 'diskhit')
    assert.equal(getReleaseManifest('diskhit')?.gitSha, 'abc123deadbeef')
  })

  it('returns null when neither memory nor disk has the ref', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ib-release-manifest-'))
    process.env.INDOBASE_LAUNCH_ROOT = dir
    clearReleaseManifestsForTests()
    assert.equal(getReleaseManifest('missing-ref'), null)
  })
})
