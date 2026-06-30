import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  readSiteRoutes,
  registerSiteRoute,
  removeSiteRoute,
  siteRoutesPath,
  writeSiteRoutes,
} from './site-routes.mjs'

test('siteRoutesPath resolves under traefik dir', () => {
  const dir = '/tmp/traefik-test'
  assert.equal(siteRoutesPath(dir), path.join(dir, 'site-routes.json'))
})

test('registerSiteRoute writes and reads deployment metadata', () => {
  const traefikDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-routes-'))
  const route = registerSiteRoute({
    ref: 'demo-ref',
    deploymentId: 'dep-123',
    prefix: 'sites/dep-123',
    storagePort: 5103,
    traefikDir,
  })

  assert.equal(route.deployment_id, 'dep-123')
  assert.equal(route.prefix, 'sites/dep-123')
  assert.equal(route.storage_port, 5103)

  const routes = readSiteRoutes(traefikDir)
  assert.equal(routes['demo-ref'].deployment_id, 'dep-123')
})

test('removeSiteRoute deletes ref entry', () => {
  const traefikDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-routes-'))
  registerSiteRoute({ ref: 'to-remove', deploymentId: 'dep-1', traefikDir })
  removeSiteRoute({ ref: 'to-remove', traefikDir })
  assert.equal(readSiteRoutes(traefikDir)['to-remove'], undefined)
})

test('writeSiteRoutes uses atomic rename', () => {
  const traefikDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-routes-'))
  writeSiteRoutes(traefikDir, { abc: { deployment_id: 'x' } })
  const file = siteRoutesPath(traefikDir)
  assert.ok(fs.existsSync(file))
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { abc: { deployment_id: 'x' } })
})
