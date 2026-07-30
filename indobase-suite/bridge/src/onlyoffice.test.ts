import assert from 'node:assert/strict'
import test from 'node:test'

import {
  documentServerUpstreamPath,
  isDocumentServerProxyPath,
  rewriteDocumentServerLocation,
  signDocumentJwt,
} from './onlyoffice.js'

test('documentServerUpstreamPath strips /ds prefix', () => {
  assert.equal(documentServerUpstreamPath('/ds'), '/')
  assert.equal(
    documentServerUpstreamPath('/ds/web-apps/apps/api/documents/api.js'),
    '/web-apps/apps/api/documents/api.js'
  )
  assert.equal(documentServerUpstreamPath('/web-apps/x'), '/web-apps/x')
})

test('isDocumentServerProxyPath recognizes editor paths', () => {
  assert.equal(isDocumentServerProxyPath('/ds/web-apps/x'), true)
  assert.equal(isDocumentServerProxyPath('/web-apps/x'), true)
  assert.equal(isDocumentServerProxyPath('/welcome/'), true)
  assert.equal(isDocumentServerProxyPath('/ds/welcome/'), true)
  assert.equal(isDocumentServerProxyPath('/api/files'), false)
})

test('rewriteDocumentServerLocation prefixes /ds for engine redirects', () => {
  process.env.WORKSPACE_PUBLIC_URL = 'https://workspace.indobase.in'
  process.env.DOCUMENT_SERVER_PUBLIC_URL = 'https://workspace.indobase.in/ds'
  assert.equal(
    rewriteDocumentServerLocation('/welcome/', '/ds/'),
    'https://workspace.indobase.in/ds/welcome/'
  )
  assert.equal(
    rewriteDocumentServerLocation('https://workspace.indobase.in/welcome/', '/ds'),
    'https://workspace.indobase.in/ds/welcome/'
  )
  assert.equal(
    rewriteDocumentServerLocation('/ds/web-apps/x', '/ds/'),
    'https://workspace.indobase.in/ds/web-apps/x'
  )
})

test('signDocumentJwt is three-part HS256', () => {
  const token = signDocumentJwt({ documentType: 'word' }, 'z'.repeat(32))
  assert.equal(token.split('.').length, 3)
})
