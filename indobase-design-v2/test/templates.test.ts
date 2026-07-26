import { BUILTIN_TEMPLATES } from '../src/server/templates.js'
import { expandTemplateLibrary } from '../src/server/templates-extra.js'

let fail = 0
const slugs = new Set<string>()
const all = expandTemplateLibrary()
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
console.log(`\n  seed hand-authored: ${BUILTIN_TEMPLATES.length}`)
console.log(`  expanded library: ${all.length} templates, ${fail} problems`)
process.exit(fail ? 1 : 0)
