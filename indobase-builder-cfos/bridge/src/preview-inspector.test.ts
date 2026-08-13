import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { htmlHasPreviewInspector, injectPreviewInspector } from './preview-inspector.ts'

describe('preview inspector', () => {
  it('injects once and only activates with ib_edit=1', () => {
    const html = injectPreviewInspector('<html><body><header><h1>Hero</h1></header></body></html>')
    assert.equal(htmlHasPreviewInspector(html), true)
    assert.match(html, /ib_edit=1/)
    assert.match(html, /indobase:preview-select/)
    const again = injectPreviewInspector(html)
    assert.equal(again, html)
  })
})
