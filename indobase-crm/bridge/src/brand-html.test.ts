import assert from 'node:assert/strict'
import test from 'node:test'

import { isHtmlContentType, rewriteBrandedHtml } from './brand-html.js'

test('isHtmlContentType only accepts HTML documents', () => {
  assert.equal(isHtmlContentType('text/html'), true)
  assert.equal(isHtmlContentType('text/html; charset=utf-8'), true)
  assert.equal(isHtmlContentType('  TEXT/HTML ;charset=UTF-8'), true)
  assert.equal(isHtmlContentType('application/xhtml+xml'), true)

  assert.equal(isHtmlContentType('application/javascript'), false)
  assert.equal(isHtmlContentType('text/javascript'), false)
  assert.equal(isHtmlContentType('application/json'), false)
  assert.equal(isHtmlContentType('text/css'), false)
  assert.equal(isHtmlContentType('image/png'), false)
  assert.equal(isHtmlContentType('font/woff2'), false)
  assert.equal(isHtmlContentType(null), false)
  assert.equal(isHtmlContentType(undefined), false)
  assert.equal(isHtmlContentType(''), false)
})

test('document title is replaced with the Indobase brand', () => {
  const out = rewriteBrandedHtml('<!doctype html><html><head><title>Frappe CRM</title></head><body></body></html>')
  assert.match(out, /<title>Indobase CRM<\/title>/)
  assert.match(out, /^<!doctype html>/)
  assert.match(out, /data-indobase-brand-scrub/)
  // Visible title text is branded; scrub script may still mention the upstream phrase as a match pattern.
  assert.equal(/<title>[^<]*Frappe/.test(out), false)
})

test('title is replaced even when it does not mention the upstream name', () => {
  const out = rewriteBrandedHtml('<head><title data-x="1">Leads</title></head>')
  assert.match(out, /<title data-x="1">Indobase CRM<\/title>/)
  assert.match(out, /data-indobase-brand-scrub/)
})

test('a title is injected when the shell has none', () => {
  const out = rewriteBrandedHtml('<html><head><meta charset="utf-8"></head><body>hi</body></html>')
  assert.match(out, /<head><script data-indobase-brand-scrub>/)
  assert.match(out, /<title>Indobase CRM<\/title>/)
  assert.match(out, /<meta charset="utf-8"><\/head><body>hi<\/body>/)
})

test('SPA brand scrub script is injected into head for Access Denied copy', () => {
  const out = rewriteBrandedHtml('<html><head></head><body><p>Frappe CRM</p></body></html>')
  assert.match(out, /data-indobase-brand-scrub/)
  assert.match(out, /Indobase CRM/)
})

test('visible body copy is rebranded', () => {
  const out = rewriteBrandedHtml('<body><h1>Welcome to Frappe CRM</h1><p>frappe crm is loading…</p></body>')
  assert.equal(out, '<body><h1>Welcome to Indobase CRM</h1><p>Indobase CRM is loading…</p></body>')
})

test('script and style bodies are never touched', () => {
  const html =
    '<script>var app = {name: "Frappe CRM"}; document.title = "Frappe CRM"; if (a<b) {}</script>' +
    '<style>.frappe-crm:after{content:"Frappe CRM"}</style>'
  assert.equal(rewriteBrandedHtml(html), html)
})

test('attribute values and URLs are never rewritten', () => {
  const html =
    '<body><a href="/assets/frappe/crm.js" data-app="Frappe CRM" class="frappe-crm">Frappe CRM</a>' +
    '<img src="/assets/crm/images/frappe-crm.png"></body>'
  const out = rewriteBrandedHtml(html)
  assert.match(out, /href="\/assets\/frappe\/crm\.js"/)
  assert.match(out, /data-app="Frappe CRM"/)
  assert.match(out, /class="frappe-crm"/)
  assert.match(out, /src="\/assets\/crm\/images\/frappe-crm\.png"/)
  assert.match(out, />Indobase CRM<\/a>/)
})

test('only user-visible meta content is rebranded', () => {
  const out = rewriteBrandedHtml(
    '<head><meta name="application-name" content="Frappe CRM">' +
      '<meta property="og:title" content="Frappe CRM">' +
      '<meta name="generator" content="frappe">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1"></head>'
  )
  assert.match(out, /<meta name="application-name" content="Indobase CRM">/)
  assert.match(out, /<meta property="og:title" content="Indobase CRM">/)
  assert.match(out, /<meta name="generator" content="frappe">/)
  assert.match(out, /content="width=device-width, initial-scale=1"/)
})

test('inline svg titles are treated as icon labels, not the document title', () => {
  const out = rewriteBrandedHtml(
    '<head><title>Frappe CRM</title></head><body><svg><title>Close</title></svg></body>'
  )
  assert.match(out, /<title>Indobase CRM<\/title>/)
  assert.match(out, /data-indobase-brand-scrub/)
  assert.match(out, /<svg><title>Close<\/title><\/svg>/)
})

test('tags whose attributes contain > survive intact', () => {
  const html = '<head><title>Frappe CRM</title><div data-q="a > b">Frappe CRM</div></head>'
  const out = rewriteBrandedHtml(html)
  assert.match(out, /data-q="a > b"/)
  assert.match(out, />Indobase CRM<\/div>/)
  assert.equal(/<div[^>]*>Frappe/.test(out), false)
})

test('comments and bare angle brackets are preserved', () => {
  const html = '<body><!-- built on Frappe CRM --><p>1 < 2 and Frappe CRM</p></body>'
  const out = rewriteBrandedHtml(html)
  assert.match(out, /<!-- built on Frappe CRM -->/)
  assert.match(out, /<p>1 < 2 and Indobase CRM<\/p>/)
})

test('empty and non-document input is returned unchanged', () => {
  assert.equal(rewriteBrandedHtml(''), '')
  assert.equal(rewriteBrandedHtml('plain text'), 'plain text')
})
