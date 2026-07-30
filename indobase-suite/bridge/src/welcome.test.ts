import assert from 'node:assert/strict'
import test from 'node:test'

import { isDocumentWelcomePath, renderWorkspaceWelcomeHtml } from './welcome.js'

test('isDocumentWelcomePath catches public welcome surfaces', () => {
  assert.equal(isDocumentWelcomePath('/welcome'), true)
  assert.equal(isDocumentWelcomePath('/welcome/'), true)
  assert.equal(isDocumentWelcomePath('/ds'), true)
  assert.equal(isDocumentWelcomePath('/ds/'), true)
  assert.equal(isDocumentWelcomePath('/ds/welcome'), true)
  assert.equal(isDocumentWelcomePath('/ds/welcome/'), true)
  assert.equal(isDocumentWelcomePath('/ds/web-apps/x'), false)
  assert.equal(isDocumentWelcomePath('/'), false)
})

test('renderWorkspaceWelcomeHtml is Indobase-only', () => {
  const html = renderWorkspaceWelcomeHtml({ studioUrl: 'https://studio.indobase.in' })
  assert.match(html, /Indobase Workspace/)
  assert.equal(/onlyoffice/i.test(html), false)
  assert.equal(/community edition/i.test(html), false)
  assert.equal(/document\s*server/i.test(html), false)
})
