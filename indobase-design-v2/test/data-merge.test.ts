import {
  extractPlaceholderKeys,
  mergePlaceholders,
  replaceTokens,
} from '../src/server/ai-draft.js'

let fail = 0

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.log(`  ! ${msg}`)
    fail++
  }
}

const sample = {
  version: '6.0.0',
  background: '#fff',
  objects: [
    { type: 'Textbox', text: 'Hello {{product_name}} — {{price}}' },
    { type: 'Textbox', text: 'Static label' },
    { type: 'Rect', fill: '#000' },
  ],
}

const keys = extractPlaceholderKeys(sample)
assert(keys.includes('product_name') && keys.includes('price'), 'extract keys')
assert(keys.length === 2, 'exactly two keys')

const merged = mergePlaceholders(sample, { product_name: 'Paneer', price: '₹220' })
const texts = (merged.objects as { text?: string }[]).map((o) => o.text)
assert(texts[0] === 'Hello Paneer — ₹220', 'merged text')
assert(texts[1] === 'Static label', 'static untouched')
assert(replaceTokens('{{a}}{{b}}', { a: '1', b: '2' }) === '12', 'replaceTokens')
assert(replaceTokens('{{missing}}', {}) === '{{missing}}', 'keep missing')

console.log(`\n  data-merge tests: ${fail ? fail + ' failed' : 'ok'}`)
process.exit(fail ? 1 : 0)
