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
  if (!client.includes('#3B8FD6')) bad('design client missing brand blue')
  else ok('design client brand blue')
  if (/Cloudflare/i.test(client)) bad('design client contains Cloudflare')
  else ok('design client Indobase-only naming')
} else {
  console.warn('  skip yjs unpack (upstream not installed)')
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
