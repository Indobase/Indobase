import assert from 'node:assert/strict'
import test from 'node:test'

import {
  documentServerUpstreamPath,
  isDocumentServerProxyPath,
  signDocumentJwt,
} from './onlyoffice.js'

test('documentServerUpstreamPath strips /ds prefix', () => {
  assert.equal(documentServerUpstreamPath('/ds'), '/')
  assert.equal(documentServerUpstreamPath('/ds/web-apps/apps/api/documents/api.js'), '/web-apps/apps/api/documents/api.js')
  assert.equal(documentServerUpstreamPath('/web-apps/x'), '/web-apps/x')
})

test('isDocumentServerProxyPath recognizes editor paths', () => {
  assert.equal(isDocumentServerProxyPath('/ds/web-apps/x'), true)
  assert.equal(isDocumentServerProxyPath('/web-apps/x'), true)
  assert.equal(isDocumentServerProxyPath('/api/files'), false)
})

test('signDocumentJwt is three-part HS256', () => {
  const token = signDocumentJwt({ documentType: 'word' }, 'z'.repeat(32))
  assert.equal(token.split('.').length, 3)
})
