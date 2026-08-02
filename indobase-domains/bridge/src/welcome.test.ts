import assert from 'node:assert/strict'
import test from 'node:test'

import { renderDomainsWelcomeHtml } from './welcome.js'

test('renderDomainsWelcomeHtml is Indobase-only', () => {
  const html = renderDomainsWelcomeHtml({ studioUrl: 'https://studio.indobase.in' })
  assert.match(html, /Indobase Domains/)
  assert.match(html, /Sign in with Studio/)
  assert.equal(/name\.com/i.test(html), false)
})
