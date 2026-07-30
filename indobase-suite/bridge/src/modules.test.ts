import assert from 'node:assert/strict'
import test from 'node:test'

import { upstreamSuitePath } from './modules.js'

test('upstreamSuitePath maps workspace home to suite launcher', () => {
  assert.equal(
    upstreamSuitePath('/s/ib-ws-org-acme/ib-ws-proj-proj1'),
    '/suite',
  )
})

test('upstreamSuitePath maps module deep links to suite app prefixes', () => {
  assert.equal(
    upstreamSuitePath('/s/ib-ws-org-acme/ib-ws-proj-proj1/files'),
    '/drive',
  )
  assert.equal(
    upstreamSuitePath('/s/ib-ws-org-acme/ib-ws-proj-proj1/docs'),
    '/writer',
  )
})
