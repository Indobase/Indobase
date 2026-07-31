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

test('buildEditorConfig sets documentServerUrl under /ds', async () => {
  const { buildEditorConfig } = await import('./onlyoffice.js')
  process.env.DOCUMENT_JWT_SECRET = 'z'.repeat(32)
  process.env.WORKSPACE_PUBLIC_URL = 'https://workspace.indobase.in'
  process.env.DOCUMENT_SERVER_PUBLIC_URL = 'https://workspace.indobase.in/ds'
  process.env.BRIDGE_INTERNAL_URL = 'http://suite-bridge:8093'
  process.env.DOCUMENT_SERVER_URL = 'http://workspace-documentserver'
  const bundle = buildEditorConfig({
    file: {
      id: 'abc',
      name: 'Notes.docx',
      kind: 'doc',
      ext: 'docx',
      size: 100,
      createdAt: '2026-07-31T00:00:00.000Z',
      updatedAt: '2026-07-31T00:00:00.000Z',
      createdBy: 'a@indobase.in',
    },
    session: {
      gotrueId: '11111111-1111-1111-1111-111111111111',
      email: 'a@indobase.in',
      projectRef: 'proj',
      orgSlug: 'org',
      role: 'owner',
      canEdit: true,
      studioUrl: 'https://studio.indobase.in',
    },
    handoffSecret: 'h'.repeat(32),
  })
  assert.equal(bundle.documentServerUrl, 'https://workspace.indobase.in/ds/')
  assert.match(bundle.documentServerApiJs, /\/ds\/web-apps\/apps\/api\/documents\/api\.js$/)
  assert.match(String((bundle.config as { document: { url: string } }).document.url), /suite-bridge:8093/)
})
