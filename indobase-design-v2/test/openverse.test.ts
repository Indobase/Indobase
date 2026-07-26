import { isAllowedStockUrl } from '../src/server/openverse.js'
import { DECK_TEMPLATES } from '../src/server/templates-deck.js'

let fail = 0

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.log(`      ! ${msg}`)
    fail++
  }
}

assert(isAllowedStockUrl('https://live.staticflickr.com/4864/x.jpg'), 'flickr allowed')
assert(isAllowedStockUrl('https://upload.wikimedia.org/wikipedia/commons/a.jpg'), 'wikimedia allowed')
assert(!isAllowedStockUrl('http://live.staticflickr.com/x.jpg'), 'http blocked')
assert(!isAllowedStockUrl('https://evil.example/x.jpg'), 'unknown host blocked')
assert(!isAllowedStockUrl('not-a-url'), 'junk blocked')

assert(DECK_TEMPLATES.length >= 10, 'deck pack size')
const slugs = new Set(DECK_TEMPLATES.map((t) => t.slug))
assert(slugs.size === DECK_TEMPLATES.length, 'unique deck slugs')
assert(
  DECK_TEMPLATES.every((t) => t.category === 'presentation' && t.width === 1920),
  'deck slides are 16:9 presentation'
)

console.log(`\n  openverse + deck checks: ${fail} problems`)
process.exit(fail ? 1 : 0)
