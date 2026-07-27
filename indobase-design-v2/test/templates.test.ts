import { BUILTIN_TEMPLATES } from '../src/server/templates.js'
import { DECK_TEMPLATES } from '../src/server/templates-deck.js'
import { expandTemplateLibrary, libraryCountsByCategory } from '../src/server/templates-extra.js'
import { generateCatalogTemplates, catalogCountsByCategory } from '../src/server/templates-catalog.js'

let fail = 0
const slugs = new Set<string>()
const all = expandTemplateLibrary()
const catalog = generateCatalogTemplates()
const byCategory = libraryCountsByCategory()

console.log('  Built-in + expanded templates:')
for (const t of all) {
  if (!t.slug || slugs.has(t.slug)) {
    console.log(`      ! bad/duplicate slug ${t.slug}`)
    fail++
  }
  slugs.add(t.slug)
  if (!t.canvas.objects.length) {
    console.log(`      ! no objects ${t.slug}`)
    fail++
  }
  if (!t.canvas.version || !t.canvas.background) {
    console.log(`      ! missing version/background ${t.slug}`)
    fail++
  }
  for (const o of t.canvas.objects as Record<string, unknown>[]) {
    if (typeof o.type !== 'string') {
      console.log(`      ! object without type`)
      fail++
    }
  }
  try {
    JSON.parse(JSON.stringify(t.canvas))
  } catch {
    console.log('      ! not JSON-serialisable')
    fail++
  }
}

const MIN_TOTAL = 1450
if (all.length < MIN_TOTAL) {
  console.log(`      ! library too small: ${all.length} < ${MIN_TOTAL}`)
  fail++
}

const requiredCats = [
  'social',
  'story',
  'presentation',
  'poster',
  'youtube',
  'linkedin',
  'ads',
  'marketing',
  'education',
  'logo',
  'docs',
  'business-card',
]
for (const c of requiredCats) {
  if (!byCategory[c] || byCategory[c] < 20) {
    console.log(`      ! category ${c} under-filled: ${byCategory[c] || 0}`)
    fail++
  }
}

// Structural diversity: catalog must use multiple layout slug prefixes
const layoutHints = new Set(
  catalog.map((t) => {
    const m = t.slug.match(/^cat-[^-]+-([^-]+)-/)
    return m?.[1] || ''
  }).filter(Boolean)
)
if (layoutHints.size < 10) {
  console.log(`      ! too few layout variants in catalog: ${layoutHints.size}`)
  fail++
}

console.log(`\n  seed hand-authored: ${BUILTIN_TEMPLATES.length}`)
console.log(`  deck pack: ${DECK_TEMPLATES.length}`)
console.log(`  procedural catalog: ${catalog.length}`)
console.log(`  expanded library: ${all.length} templates`)
console.log('  by category:', byCategory)
console.log('  catalog by category:', catalogCountsByCategory())
console.log(`  layout variants: ${layoutHints.size}`)
console.log(`  problems: ${fail}`)
process.exit(fail ? 1 : 0)
