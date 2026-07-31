import assert from 'node:assert/strict'
import test from 'node:test'

import { isHtmlContentType, rewriteBrandedHtml } from './brand-html.js'

test('isHtmlContentType only accepts HTML documents', () => {
  assert.equal(isHtmlContentType('text/html'), true)
  assert.equal(isHtmlContentType('text/html; charset=utf-8'), true)
  assert.equal(isHtmlContentType('application/xhtml+xml'), true)
  assert.equal(isHtmlContentType('application/javascript'), false)
  assert.equal(isHtmlContentType('text/css'), false)
  assert.equal(isHtmlContentType(null), false)
})

test('document title is replaced with the Indobase brand', () => {
  const out = rewriteBrandedHtml(
    '<!doctype html><html><head><title>Frappe Helpdesk</title></head><body></body></html>'
  )
  assert.match(out, /<title>Indobase Helpdesk<\/title>/)
  assert.equal(out.includes('Frappe'), false)
})

test('visible body copy is rebranded', () => {
  const out = rewriteBrandedHtml('<body><h1>Welcome to Frappe Helpdesk</h1></body>')
  assert.equal(out, '<body><h1>Welcome to Indobase Helpdesk</h1></body>')
})

test('script and style bodies are never touched', () => {
  const html = '<script>var app = {name: "Frappe Helpdesk"};</script>'
  assert.equal(rewriteBrandedHtml(html), html)
})
