#!/usr/bin/env node
/**
 * Pack formats/src/<name>/{server.js,client.js,README.md} into a .gadget archive
 * (Yjs V2 state update, gzipped) next to the Indobase format sidecars.
 *
 * Usage:
 *   node formats/scripts/pack-gadget.mjs design
 *   node formats/scripts/pack-gadget.mjs design --out workspace-design
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const formatsRoot = resolve(here, '..')
const cfosRoot = resolve(formatsRoot, '..')
const require = createRequire(import.meta.url)

function loadYjs() {
  const candidates = [
    join(cfosRoot, 'upstream/cloudflare-os/packages/workshop-backend/node_modules/yjs'),
    join(cfosRoot, 'upstream/cloudflare-os/node_modules/yjs'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return require(p)
  }
  throw new Error(
    'yjs not found. Clone/fetch the agent runtime first:\n' +
      '  ./scripts/fetch-cloudflare-os.sh && cd upstream/cloudflare-os && pnpm install',
  )
}

const MAGIC = 0xec2e2d3a2300e317n
const VERSION = 1
const PREFIX_BYTES = 24

function serializeArchive(metadata, content) {
  const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata))
  const out = new Uint8Array(PREFIX_BYTES + metadataBytes.byteLength + content.byteLength)
  const view = new DataView(out.buffer)
  view.setBigUint64(0, MAGIC)
  view.setUint32(8, VERSION)
  view.setUint32(12, metadataBytes.byteLength)
  view.setBigUint64(16, BigInt(content.byteLength))
  out.set(metadataBytes, PREFIX_BYTES)
  out.set(content, PREFIX_BYTES + metadataBytes.byteLength)
  return out
}

const args = process.argv.slice(2).filter((a) => a !== '--')
const name = args[0]
const outIdx = args.indexOf('--out')
const outStem = outIdx >= 0 ? args[outIdx + 1] : `workspace-${name}`

if (!name) {
  console.error('usage: node formats/scripts/pack-gadget.mjs <src-name> [--out workspace-design]')
  process.exit(2)
}

const srcDir = join(formatsRoot, 'src', name)
const files = ['server.js', 'client.js', 'README.md']
for (const f of files) {
  if (!existsSync(join(srcDir, f))) {
    console.error(`missing ${join(srcDir, f)}`)
    process.exit(1)
  }
}

const Y = loadYjs()
const doc = new Y.Doc()
const root = doc.getMap()
doc.transact(() => {
  for (const f of files) {
    const text = new Y.Text()
    // sync read via require fs already done — use readFile sync-less later
    root.set(f, text)
  }
})

// Fill texts in a second pass (Y.Text insert after map set)
for (const f of files) {
  const body = await readFile(join(srcDir, f), 'utf8')
  const ytext = root.get(f)
  ytext.delete(0, ytext.length)
  ytext.insert(0, body)
}

const update = Y.encodeStateAsUpdateV2(doc)
const compressed = gzipSync(update)

const sidecarPath = join(formatsRoot, `${outStem}.json`)
let title = outStem
let description = `Indobase ${name} format`
let author = { type: 'user', name: 'Indobase', id: 'builder@indobase.in' }
if (existsSync(sidecarPath)) {
  const side = JSON.parse(await readFile(sidecarPath, 'utf8'))
  title = side.title || title
  description = side.description || description
  author = side.author || author
}

const metadata = {
  title,
  description,
  author,
  created: new Date().toISOString(),
  version: 1,
  lastUpdated: new Date().toISOString(),
  bindings: {},
}

const archive = serializeArchive(metadata, compressed)
const outPath = join(formatsRoot, `${outStem}.gadget`)
await mkdir(formatsRoot, { recursive: true })
await writeFile(outPath, archive)
console.log(`Packed ${name} → ${outPath} (${archive.byteLength} bytes, content ${compressed.byteLength} gzip / ${update.byteLength} raw)`)
console.log(`  files: ${files.map((f) => `${f}`).join(', ')}`)
