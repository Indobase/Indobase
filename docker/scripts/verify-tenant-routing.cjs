#!/usr/bin/env node
/**
 * Smoke-test tenant public URLs: /auth/v1/health and /rest/v1/ must not return PGRST125 or 404.
 * Usage: node docker/scripts/verify-tenant-routing.cjs [domain]
 */
const { execSync } = require('node:child_process')

const domain = process.argv[2] || process.env.PUBLIC_DOMAIN || 'indobase.in'
const dockerPs = execSync('docker ps --format "{{.Names}}"', { encoding: 'utf8' })
const refs = new Set()
for (const line of dockerPs.split('\n')) {
  const m = line.match(/indobase-tenant-([a-z0-9-]+)-tenant-rest/)
  if (m) refs.add(m[1])
}

let failed = 0
for (const ref of [...refs].sort()) {
  const host = `https://${ref}.${domain}`
  let authCode = '000'
  let restCode = '000'
  let restBody = ''
  try {
    authCode = execSync(`curl -sS -o /tmp/auth.json -w '%{http_code}' --max-time 15 '${host}/auth/v1/health'`, {
      encoding: 'utf8',
    }).trim()
    restCode = execSync(
      `curl -sS -o /tmp/rest.json -w '%{http_code}' --max-time 15 '${host}/rest/v1/'`,
      { encoding: 'utf8' }
    ).trim()
    restBody = execSync('head -c 200 /tmp/rest.json 2>/dev/null || true', { encoding: 'utf8' })
  } catch (e) {
    failed++
    console.log(`FAIL ${ref} curl error`)
    continue
  }
  const bad =
    authCode !== '200' ||
    restCode !== '200' ||
    restBody.includes('PGRST125') ||
    restBody.includes('PGRST205')
  if (bad) {
    failed++
    console.log(`FAIL ${ref} auth=${authCode} rest=${restCode} body=${restBody.slice(0, 80)}`)
  } else {
    console.log(`OK   ${ref}`)
  }
}
if (failed) {
  console.error(`\n${failed} tenant(s) failed routing check`)
  process.exit(1)
}
console.log(`\nAll ${refs.size} tenant(s) passed`)
