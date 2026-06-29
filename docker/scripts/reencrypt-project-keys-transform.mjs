import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const crypto = require('/srv/studio/node_modules/.pnpm/crypto-js@4.2.0/node_modules/crypto-js')

const pgKey = process.env.PG_META_CRYPTO_KEY?.trim()
const cryptoKey = process.env.CRYPTO_KEY?.trim()
if (!pgKey || !cryptoKey || pgKey === cryptoKey) {
  console.log('skip')
  process.exit(0)
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
const rows = JSON.parse(readFileSync('/tmp/project-keys.json', 'utf8'))
const statements = []

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
  statements.push(
    `update saas.projects set ${assignments.join(', ')} where ref = '${esc(row.ref)}';`
  )
  console.log('will reencrypt', row.ref)
}

writeFileSync('/tmp/reencrypt.sql', statements.join('\n'))
console.log('statements', statements.length)
