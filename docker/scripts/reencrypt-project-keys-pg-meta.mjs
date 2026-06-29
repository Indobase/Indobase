#!/usr/bin/env node
/**
 * Fleet repair: re-encrypt saas.projects API-key columns from CRYPTO_KEY → PG_META_CRYPTO_KEY.
 * Run on the control-plane VPS host (not inside the Studio container).
 *
 *   PG_META_KEY=... CRYPTO_KEY=... node reencrypt-project-keys-pg-meta.mjs <postgres-container-id>
 */
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const cryptoJsPaths = [
  path.join(scriptDir, '../../apps/studio/node_modules/crypto-js'),
  '/srv/studio/node_modules/.pnpm/crypto-js@4.2.0/node_modules/crypto-js',
]
let crypto
for (const p of cryptoJsPaths) {
  try {
    crypto = require(p)
    break
  } catch {
    /* try next */
  }
}
if (!crypto) {
  console.error('crypto-js not found; run from repo root or copy script beside studio node_modules')
  process.exit(1)
}

const dbCid = process.argv[2]
if (!dbCid) {
  console.error('usage: PG_META_KEY=... CRYPTO_KEY=... node reencrypt-project-keys-pg-meta.mjs <postgres-container-id>')
  process.exit(1)
}

const pgKey = process.env.PG_META_KEY?.trim() || process.env.PG_META_CRYPTO_KEY?.trim()
const cryptoKey = process.env.CRYPTO_KEY?.trim()
if (!pgKey || !cryptoKey) {
  console.error('Set PG_META_KEY (or PG_META_CRYPTO_KEY) and CRYPTO_KEY in the environment')
  process.exit(1)
}
if (pgKey === cryptoKey) {
  console.log('keys already aligned; nothing to do')
  process.exit(0)
}

function psql(sql) {
  return execSync(
    `docker exec ${dbCid} psql -U postgres -d postgres -t -A -c ${JSON.stringify(sql)}`,
    { encoding: 'utf8' }
  ).trim()
}

function decrypt(enc, key) {
  try {
    const plain = crypto.AES.decrypt(enc, key).toString(crypto.enc.Utf8)
    return plain.length > 0 ? plain : null
  } catch {
    return null
  }
}

const esc = (s) => String(s).replace(/'/g, "''")

const raw = psql(
  `select coalesce(json_agg(t), '[]'::json)::text from (
    select ref, anon_key_enc, service_key_enc, jwt_secret_enc, db_pass_enc
    from saas.projects
  ) t`
)
const rows = JSON.parse(raw || '[]')
let updated = 0

for (const row of rows) {
  const assignments = []

  for (const col of ['anon_key_enc', 'service_key_enc', 'jwt_secret_enc', 'db_pass_enc']) {
    const enc = row[col]
    if (!enc || !String(enc).trim()) continue
    if (decrypt(enc, pgKey)) continue
    const plain = decrypt(enc, cryptoKey)
    if (!plain) continue
    assignments.push(`${col} = '${esc(crypto.AES.encrypt(plain, pgKey).toString())}'`)
  }

  if (!assignments.length) continue

  psql(`update saas.projects set ${assignments.join(', ')} where ref = '${esc(row.ref)}'`)
  updated++
  console.log('reencrypted', row.ref)
}

console.log('done', { projects: rows.length, updated })
