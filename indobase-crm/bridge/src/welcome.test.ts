import assert from 'node:assert/strict'
import test from 'node:test'

import { renderCrmWelcomeHtml } from './welcome.js'

test('renderCrmWelcomeHtml is Indobase-only', () => {
  const html = renderCrmWelcomeHtml({ studioUrl: 'https://studio.indobase.in' })
  assert.match(html, /Indobase CRM/)
  assert.match(html, /Sign in with Studio/)
  assert.match(html, /https:\/\/studio\.indobase\.in\/sign-in/)
  assert.equal(/frappe/i.test(html), false)
  assert.equal(/not permitted/i.test(html), false)
  assert.equal(/\blogin\b/i.test(html), false)
})
