/**
 * Static site hosting for tenant project subdomains (root path).
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fixTenantTraefikForRef } from './tenant-traefik.mjs'

export const TENANT_SITE_NGINX_CONF = `server {
  listen 8080;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
`

function safeRelativeSitePath(filePath) {
  const trimmed = String(filePath || '').trim().replace(/\\/g, '/')
  if (!trimmed || trimmed.startsWith('/') || trimmed.includes('..')) {
    throw new Error(`Invalid site file path: ${filePath}`)
  }
  return trimmed
}

function clearDirectory(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    return
  }

  for (const entry of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true })
  }
}

function runCompose(composePath, args) {
  return new Promise((resolve, reject) => {
    const p = spawn('docker', ['compose', '-f', composePath, ...args], {
      stdio: 'inherit',
      cwd: path.dirname(composePath),
    })
    p.on('error', reject)
    p.on('exit', (code) => {
      if (code === 0) resolve(undefined)
      else reject(new Error(`docker compose ${args.join(' ')} exited with code ${code}`))
    })
  })
}

function composeHasTenantSite(composeText) {
  return /^\s{2}tenant-site:\s*$/m.test(composeText)
}

function findPublishedPortForContainerPort(composeText, containerPort) {
  const withHost = new RegExp(`["']?(?:[\\w.]+):(\\d+):${containerPort}["']?`, 'g')
  let match
  while ((match = withHost.exec(composeText)) !== null) {
    const port = Number(match[1])
    if (Number.isFinite(port) && port > 0) {
      return port
    }
  }

  const shortForm = new RegExp(`["']?(\\d+):${containerPort}["']?`, 'g')
  while ((match = shortForm.exec(composeText)) !== null) {
    const port = Number(match[1])
    if (Number.isFinite(port) && port > 0) {
      return port
    }
  }

  return null
}

function inferComposePublishHost(composeText) {
  const withHost = composeText.match(/["']?([\w.]+):\d+:\d+["']?/)
  if (withHost?.[1]) return withHost[1]
  return process.env.TRAEFIK_UPSTREAM_HOST?.trim() || '172.17.0.1'
}

function inferTenantSitePort(composeText) {
  const functionsPort = findPublishedPortForContainerPort(composeText, 9000)
  if (functionsPort != null) {
    return functionsPort + 2
  }

  const restPort = findPublishedPortForContainerPort(composeText, 3000)
  if (restPort != null) {
    return restPort + 6
  }

  return null
}

function buildTenantSiteServiceBlock({ publishHost, sitePort, useNetwork }) {
  const networkBlock = useNetwork
    ? `
    networks:
      - tenant_data_plane`
    : ''

  return `
  tenant-site:
    image: nginx:1.27-alpine
    restart: unless-stopped${networkBlock}
    volumes:
      - ./site:/usr/share/nginx/html:ro
      - ./site-nginx.conf:/etc/nginx/conf.d/default.conf:ro
    ports:
      - "${publishHost}:${sitePort}:8080"
`
}

function insertTenantSiteService(composeText, siteServiceBlock) {
  const networksIndex = composeText.search(/^\nnetworks:\s*$/m)
  if (networksIndex >= 0) {
    return `${composeText.slice(0, networksIndex)}\n${siteServiceBlock}${composeText.slice(networksIndex)}`
  }

  const volumesIndex = composeText.search(/^\nvolumes:\s*$/m)
  if (volumesIndex >= 0) {
    return `${composeText.slice(0, volumesIndex)}\n${siteServiceBlock}${composeText.slice(volumesIndex)}`
  }

  return `${composeText.trimEnd()}\n${siteServiceBlock}`
}

export function patchComposeForTenantSite(composeText) {
  if (composeHasTenantSite(composeText)) {
    return { composeText, patched: false, sitePort: findPublishedPortForContainerPort(composeText, 8080) }
  }

  const sitePort = inferTenantSitePort(composeText)
  if (sitePort == null) {
    throw new Error('Could not infer tenant-site port from existing compose bindings')
  }

  const publishHost = inferComposePublishHost(composeText)
  const useNetwork = composeText.includes('tenant_data_plane:')
  const siteServiceBlock = buildTenantSiteServiceBlock({ publishHost, sitePort, useNetwork })

  return {
    composeText: insertTenantSiteService(composeText, siteServiceBlock),
    patched: true,
    sitePort,
  }
}

export async function ensureTenantSiteService({
  ref,
  tenantsDir,
  traefikDir,
}) {
  const tenantOutDir = path.join(tenantsDir, ref)
  const composePath = path.join(tenantOutDir, 'docker-compose.yml')
  const siteDir = path.join(tenantOutDir, 'site')
  const nginxConfPath = path.join(tenantOutDir, 'site-nginx.conf')

  if (!fs.existsSync(composePath)) {
    return { ok: false, ref, reason: 'compose_missing' }
  }

  fs.mkdirSync(siteDir, { recursive: true })
  fs.writeFileSync(nginxConfPath, TENANT_SITE_NGINX_CONF, 'utf8')

  const originalCompose = fs.readFileSync(composePath, 'utf8')
  const { composeText, patched, sitePort } = patchComposeForTenantSite(originalCompose)

  if (patched) {
    fs.writeFileSync(composePath, composeText, 'utf8')
  }

  await runCompose(composePath, ['up', '-d', 'tenant-site'])

  const traefik = fixTenantTraefikForRef(ref, traefikDir)

  return {
    ok: true,
    patched,
    ref,
    site_port: sitePort,
    traefik,
  }
}

export async function ensureTenantSiteFleet({ tenantsDir, traefikDir }) {
  const results = []

  if (!fs.existsSync(tenantsDir)) {
    return results
  }

  for (const entry of fs.readdirSync(tenantsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.includes('.')) continue

    try {
      results.push(
        await ensureTenantSiteService({
          ref: entry.name,
          tenantsDir,
          traefikDir,
        })
      )
    } catch (error) {
      results.push({
        ok: false,
        ref: entry.name,
        reason: error instanceof Error ? error.message : 'ensure_site_failed',
      })
    }
  }

  return results
}

export async function publishTenantSiteFiles({
  files,
  ref,
  tenantsDir,
  traefikDir,
}) {
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    throw new Error('files object is required')
  }

  const entries = Object.entries(files)
  if (!entries.length) {
    throw new Error('At least one site file is required')
  }

  const tenantOutDir = path.join(tenantsDir, ref)
  const siteDir = path.join(tenantOutDir, 'site')
  const composePath = path.join(tenantOutDir, 'docker-compose.yml')

  const ensured = await ensureTenantSiteService({
    ref,
    tenantsDir,
    traefikDir,
  })

  if (!ensured.ok) {
    throw new Error(ensured.reason || 'Failed to ensure tenant-site service')
  }

  clearDirectory(siteDir)

  for (const [rawPath, content] of entries) {
    const relPath = safeRelativeSitePath(rawPath)
    const dest = path.join(siteDir, relPath)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, String(content), 'utf8')
  }

  if (fs.existsSync(composePath)) {
    await runCompose(composePath, ['up', '-d', 'tenant-site'])
  }

  const traefik = fixTenantTraefikForRef(ref, traefikDir)

  return {
    ensured,
    file_count: entries.length,
    site_dir: siteDir,
    traefik,
  }
}
