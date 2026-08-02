import assert from 'node:assert/strict'
import test from 'node:test'

import { renderDesignWelcomeHtml } from '../src/server/welcome.ts'

test('renderDesignWelcomeHtml is Indobase-only', () => {
  const html = renderDesignWelcomeHtml({ studioUrl: 'https://studio.indobase.in' })
  assert.match(html, /Indobase Design/)
  assert.match(html, /Sign in with Studio/)
  assert.equal(/penpot/i.test(html), false)
  assert.equal(/canva/i.test(html), false)
})
