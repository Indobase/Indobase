#!/usr/bin/env node
/**
 * Rewrite all tenant-*.yml from live docker ps (stripPrefix + correct ports).
 * Usage: node docker/scripts/fix-tenant-traefik-from-docker.cjs [/path/to/traefik/dynamic]
 */
const path = require('node:path')

const traefikDir = process.argv[2] || '/etc/dokploy/traefik/dynamic'

;(async () => {
  const mod = await import(path.join(__dirname, 'provisioner/tenant-traefik.mjs'))
  const results = mod.fixAllTenantTraefikFromDocker(traefikDir)
  for (const r of results) {
    if (r.ok) console.log('fixed', r.ref, r.ports)
    else console.warn('skip', r.ref, r.ports, r.reason)
  }
  const fixed = results.filter((r) => r.ok).length
  console.log(`done: ${fixed}/${results.length} running stack(s) in ${traefikDir}`)
})()
