import { BUILTIN_TEMPLATES } from '../src/server/templates.js'

let fail = 0
const slugs = new Set<string>()
console.log('  Built-in templates:')
for (const t of BUILTIN_TEMPLATES) {
  console.log(`    ${String(t.width).padStart(4)}x${String(t.height).padEnd(5)} ${t.category.padEnd(13)} ${t.name}`)
  if (!t.slug || slugs.has(t.slug)) { console.log(`      ! bad/duplicate slug`); fail++ }
  slugs.add(t.slug)
  if (!t.canvas.objects.length) { console.log(`      ! no objects`); fail++ }
  if (!t.canvas.version || !t.canvas.background) { console.log(`      ! missing version/background`); fail++ }
  // every object must carry a fabric type, and stay inside the canvas bounds
  for (const o of t.canvas.objects as Record<string, unknown>[]) {
    if (typeof o.type !== 'string') { console.log(`      ! object without type`); fail++ }
    const left = Number(o.left ?? 0), top = Number(o.top ?? 0)
    if (left > t.width || top > t.height) { console.log(`      ! object starts outside canvas (${left},${top})`); fail++ }
  }
  // must survive a JSON round-trip (this is exactly what gets stored in jsonb)
  try { JSON.parse(JSON.stringify(t.canvas)) } catch { console.log('      ! not JSON-serialisable'); fail++ }
}
console.log(`\n  ${BUILTIN_TEMPLATES.length} templates, ${fail} problems`)
process.exit(fail ? 1 : 0)
