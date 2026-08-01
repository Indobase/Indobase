import assert from 'node:assert/strict'
import test from 'node:test'
import { hostPortFor } from './tenant-traefik.mjs'

test('hostPortFor matches 172.17.0.1 bindings', () => {
  const dockerPs =
    'indobase-tenant-demo-tenant-rest-1\t172.17.0.1:31143->3000/tcp\n' +
    'indobase-tenant-demo-tenant-auth-1\t172.17.0.1:31144->9999/tcp\n'
  assert.equal(hostPortFor(dockerPs, 'demo', 'rest'), 31143)
  assert.equal(hostPortFor(dockerPs, 'demo', 'auth'), 31144)
})

test('hostPortFor matches VPS public IP bindings', () => {
  const dockerPs =
    'indobase-tenant-nexora-tenant-rest-1\t103.190.92.248:48642->3000/tcp\n' +
    'indobase-tenant-nexora-tenant-auth-1\t103.190.92.248:48643->9999/tcp\n' +
    'indobase-tenant-nexora-tenant-storage-1\t103.190.92.248:48644->5000/tcp\n' +
    'nexora.indobase-realtime\t103.190.92.248:48645->4000/tcp\n' +
    'indobase-tenant-nexora-tenant-functions-1\t103.190.92.248:48646->9000/tcp\n' +
    'indobase-tenant-nexora-tenant-site-1\t80/tcp, 103.190.92.248:48648->8080/tcp\n'
  assert.equal(hostPortFor(dockerPs, 'nexora', 'rest'), 48642)
  assert.equal(hostPortFor(dockerPs, 'nexora', 'auth'), 48643)
  assert.equal(hostPortFor(dockerPs, 'nexora', 'storage'), 48644)
  assert.equal(hostPortFor(dockerPs, 'nexora', 'realtime'), 48645)
  assert.equal(hostPortFor(dockerPs, 'nexora', 'functions'), 48646)
  assert.equal(hostPortFor(dockerPs, 'nexora', 'site'), 48648)
})

test('hostPortFor matches 0.0.0.0 bindings', () => {
  const dockerPs = 'indobase-tenant-demo-tenant-rest-1\t0.0.0.0:18000->3000/tcp\n'
  assert.equal(hostPortFor(dockerPs, 'demo', 'rest'), 18000)
})
