import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSpaFallbackPaths,
  getStoragePortForRef,
  parseRefFromHost,
  resolveStorageObjectUrl,
} from './site-static-proxy.mjs'

test('parseRefFromHost extracts project ref', () => {
  assert.equal(parseRefFromHost('myproj.indobase.in', 'indobase.in'), 'myproj')
  assert.equal(parseRefFromHost('MYPROJ.indobase.in:443', 'indobase.in'), 'myproj')
  assert.equal(parseRefFromHost('evil.com', 'indobase.in'), null)
})

test('buildSpaFallbackPaths includes index fallbacks', () => {
  assert.deepEqual(buildSpaFallbackPaths('/'), ['/', '/index.html'])
  assert.deepEqual(buildSpaFallbackPaths('/about'), [
    '/about',
    '/about/index.html',
    '/about.html',
    '/index.html',
  ])
  assert.deepEqual(buildSpaFallbackPaths('/assets/app.js'), ['/assets/app.js', '/index.html'])
})

test('resolveStorageObjectUrl builds public storage URL', () => {
  const url = resolveStorageObjectUrl({
    upstream: '172.17.0.1',
    storagePort: 5103,
    prefix: 'sites/dep-1',
    objectPath: 'index.html',
  })
  assert.equal(
    url,
    'http://172.17.0.1:5103/object/public/hosting/sites/dep-1/index.html'
  )
})

test('getStoragePortForRef prefers route storage_port', () => {
  const dockerPs = 'indobase-tenant-demo-tenant-storage\t172.17.0.1:5999->5000/tcp\n'
  const routes = { demo: { storage_port: 5103 } }
  assert.equal(getStoragePortForRef('demo', dockerPs, routes, '/tmp'), 5103)
})

test('getStoragePortForRef falls back to docker ps', () => {
  const dockerPs = 'indobase-tenant-demo-tenant-storage\t172.17.0.1:5999->5000/tcp\n'
  assert.equal(getStoragePortForRef('demo', dockerPs, {}, '/tmp/none'), 5999)
})

test('getStoragePortForRef accepts public IP docker bindings', () => {
  const dockerPs =
    'indobase-tenant-demo-tenant-storage\t103.190.92.248:48644->5000/tcp\n'
  assert.equal(getStoragePortForRef('demo', dockerPs, {}, '/tmp/none'), 48644)
})
