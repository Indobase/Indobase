#!/usr/bin/env node
/** Smoke-check Indobase formats sidecars + Design archive round-trip. */
import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const formatsRoot = resolve(here, '..')
const cfosRoot = resolve(formatsRoot, '..')
const OUTPUT_ICONS = new Set([
  'fileText', 'gridNine', 'presentation', 'appWindow', 'flowArrow',
  'kanban', 'chartBar', 'table', 'notebook', 'listChecks',
])
const MAGIC = 0xec2e2d3a2300e317n
const PREFIX = 24
const require = createRequire(import.meta.url)

const expected = [
  ['workspace-docs', 'format.document'],
  ['workspace-sheets', 'format.spreadsheet'],
  ['workspace-slides', 'format.slides'],
  ['workspace-design', 'format.design'],
]

let failed = 0
function ok(msg) { console.log(`  ok  ${msg}`) }
function bad(msg) { console.error(`  FAIL ${msg}`); failed++ }

for (const [stem, id] of expected) {
  const sidePath = join(formatsRoot, `${stem}.json`)
  const gadgetPath = join(formatsRoot, `${stem}.gadget`)
  if (!existsSync(sidePath)) { bad(`missing ${stem}.json`); continue }
  if (!existsSync(gadgetPath)) { bad(`missing ${stem}.gadget`); continue }
  const side = JSON.parse(await readFile(sidePath, 'utf8'))
  if (side.blueprintId !== id) bad(`${stem}: blueprintId ${side.blueprintId} != ${id}`)
  else ok(`${stem} id ${id}`)
  if (side.author?.name !== 'Indobase') bad(`${stem}: author must be Indobase`)
  else ok(`${stem} author Indobase`)
  if (!OUTPUT_ICONS.has(side.output?.icon)) bad(`${stem}: bad icon ${side.output?.icon}`)
  else ok(`${stem} icon ${side.output.icon}`)
  if (id === 'format.design') {
    const desc = String(side.description || '')
    if (!/ALWAYS/i.test(desc) || !/format\.design/.test(desc)) {
      bad('workspace-design description must hard-route with ALWAYS + format.design')
    } else ok('workspace-design description routes Design')
    if (!/logo|instagram|poster/i.test(desc)) bad('workspace-design description missing logo/social/poster')
    else ok('workspace-design description covers logo/social/poster')
  }
  if (id === 'format.slides') {
    const desc = String(side.description || '')
    if (!/NEVER/i.test(desc) || !/format\.design/.test(desc)) {
      bad('workspace-slides description must forbid graphics and point to format.design')
    } else ok('workspace-slides description defers graphics to Design')
  }

  const bytes = await readFile(gadgetPath)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getBigUint64(0) !== MAGIC) bad(`${stem}.gadget bad magic`)
  else ok(`${stem}.gadget magic`)
}

// Design content must unpack to server/client/README
const yjsPath = join(cfosRoot, 'upstream/cloudflare-os/packages/workshop-backend/node_modules/yjs')
if (existsSync(yjsPath)) {
  const Y = require(yjsPath)
  const bytes = await readFile(join(formatsRoot, 'workspace-design.gadget'))
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const metaLen = view.getUint32(12)
  const content = gunzipSync(bytes.subarray(PREFIX + metaLen))
  const doc = new Y.Doc()
  Y.applyUpdateV2(doc, new Uint8Array(content))
  const root = doc.getMap()
  for (const f of ['server.js', 'client.js', 'README.md']) {
    const t = root.get(f)
    if (!(t && t.toString().length > 20)) bad(`design missing ${f}`)
    else ok(`design has ${f} (${t.toString().length} chars)`)
  }
  const client = root.get('client.js').toString()
  const server = root.get('server.js').toString()
  if (!client.includes('#3B8FD6')) bad('design client missing brand blue')
  else ok('design client brand blue')
  if (/Cloudflare/i.test(client)) bad('design client contains Cloudflare')
  else ok('design client Indobase-only naming')
  if (!server.includes('bootstrapFromPrompt')) bad('design server missing bootstrapFromPrompt')
  else ok('design server bootstrapFromPrompt')
} else {
  console.warn('  skip yjs unpack (upstream not installed)')
}

// Keyword → format.design map (standalone script, kept in sync with adapter)
{
  const { spawnSync } = await import('node:child_process')
  const assertScript = join(formatsRoot, 'scripts/assert-design-routing.mjs')
  const r = spawnSync(process.execPath, [assertScript], { encoding: 'utf8' })
  if (r.status !== 0) {
    bad('assert-design-routing failed')
    if (r.stdout) console.error(r.stdout)
    if (r.stderr) console.error(r.stderr)
  } else ok('assert-design-routing keyword map')
}

// No AppleDouble in formats root listing
const junk = (await readdir(formatsRoot)).filter((f) => f.startsWith('._'))
if (junk.length) bad(`AppleDouble files present: ${junk.join(', ')}`)
else ok('no AppleDouble junk in formats/')

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll format checks passed.')
