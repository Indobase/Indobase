import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseProductOptions, parseSizeValues, variantRowsFromOptions } from './catalog-domain.ts'

describe('catalog domain parse', () => {
  it('parses comma sizes into five variant rows for one product', () => {
    const text = 'Add the black Apex Runner in sizes 7, 8, 9, 10, and 11.'
    assert.deepEqual(parseSizeValues(text), ['7', '8', '9', '10', '11'])
    const options = parseProductOptions(text)
    const rows = variantRowsFromOptions('apex-runner', options, 1299900, 10)
    assert.equal(rows.length, 5)
    assert.equal(rows[0]?.options.Color, 'Black')
    assert.equal(rows[0]?.options.Size, '7')
  })
})
