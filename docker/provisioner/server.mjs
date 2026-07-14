/**
 * Minimal data-plane provisioner.
 *
 * Responsibilities:
 * - Authenticate requests from Studio using a shared token.
 * - Write per-project `docker-compose.yml` and `traefik.yml` to mounted host paths.
 * - Optionally run `docker compose up -d` for that tenant stack (`POST /provision`).
 * - Repair existing stacks (`POST /repair-stack`, `POST /repair-fleet`).
 * - Optionally tear down tenant stacks (`POST /teardown`).
 *
 * Required env:
 *   PROVISIONER_TOKEN
 *   PROVISIONER_TENANTS_DIR=/mnt/tenants
 *   PROVISIONER_TENANTS_HOST_DIR=/var/lib/docker/volumes/<stack>_tenants-data/_data
 *   PROVISIONER_TRAEFIK_DYNAMIC_DIR=/mnt/traefik
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fixAllTenantTraefikFromDocker, fixTenantTraefikForRef, getDockerPsLines, hostPortFor } from './tenant-traefik.mjs'
import { TENANT_SITE_NGINX_CONF, ensureSiteNginxConfFile, ensureTenantSiteFleet, ensureTenantSiteService, publishTenantSiteFiles } from './site-hosting.mjs'
import {
  portsFromPortBase,
  registerSharedGatewayTenant,
  unregisterSharedGatewayTenant,
  parsePortBaseFromComposeYaml,
} from './shared-gateway-routes.mjs'
import { registerSiteRoute, removeSiteRoute } from './site-routes.mjs'
import { startSiteStaticProxy } from './site-static-proxy.mjs'

const token = process.env.PROVISIONER_TOKEN || ''
const tenantsDir = process.env.PROVISIONER_TENANTS_DIR || '/mnt/tenants'
const traefikDir = process.env.PROVISIONER_TRAEFIK_DYNAMIC_DIR || '/mnt/traefik'
const port = Number(process.env.PORT || '8787')
const auxRolePassword = (process.env.SAAS_DATA_PLANE_AUX_ROLE_PASSWORD || '').trim()
const legacyBootstrapPassword = 'kVfP0FQo2cGGlqAX'
/** Wrong placeholder from backend VPS POSTGRES_PASSWORD — never use for tenant aux roles. */
const wrongFleetPlaceholderPassword = 'indobase_db_password_change_me'
const traefikUpstreamHost = (process.env.TRAEFIK_UPSTREAM_HOST || '172.17.0.1').trim()

if (!token) {
  console.error('PROVISIONER_TOKEN is required')
  process.exit(1)
}

function json(res, code, body) {
  res.statusCode = code
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 9_000_000) {
        reject(new Error('body too large'))
        req.destroy()
      }
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function safeRef(ref) {
  if (typeof ref !== 'string' || !/^[a-z0-9-]+$/i.test(ref)) return null
  return ref
}

function assertValidComposeYaml(yml) {
  const text = String(yml || '').trim()
  if (!text) throw new Error('docker-compose.yml is empty')
  if (/GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI:\s*'[^']+'\/auth\/v1\/callback/.test(text)) {
    throw new Error('Invalid compose: broken GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI quoting')
  }
  if (!text.includes('tenant-rest:') || !text.includes('tenant-auth:')) {
    throw new Error('Invalid compose: missing tenant-rest or tenant-auth')
  }
}

function repairKnownComposeYaml(yml) {
  let text = String(yml || '')
  text = text.replace(
    /GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI:\s*'([^']+)'\/auth\/v1\/callback/g,
    "GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI: '$1/auth/v1/callback'"
  )
  if (auxRolePassword) {
    text = text.split(legacyBootstrapPassword).join(auxRolePassword)
    text = text.split(wrongFleetPlaceholderPassword).join(auxRolePassword)
    text = text.replace(
      /(postgresql:\/\/(?:authenticator|supabase_auth_admin|supabase_storage_admin|supabase_admin):)[^@]+(@)/g,
      `$1${auxRolePassword}$2`
    )
    text = text.replace(/(DB_PASSWORD: ')[^']+(')/g, `$1${auxRolePassword}$2`)
  }
  text = text.replace(/VERIFY_JWT:\s*["']?false["']?/gi, 'VERIFY_JWT: "true"')
  text = text.replace(/\n {6}VERIFY_JWT: "true"(?=\n {4}(?:command:|volumes:))/g, '')
  if (text.includes('tenant-functions:') && !/\bVERIFY_JWT:/i.test(text)) {
    text = text.replace(
      /( {2}tenant-functions:\n(?: {4}.+\n)*? {4}environment:\n(?: {6}.+\n)+)/m,
      (match) => `${match}      VERIFY_JWT: "true"\n`
    )
  }
  text = text.replace(/DB_ENC_KEY: '([^']+)'/g, (match, key) => {
    if (key.length > 16) return `DB_ENC_KEY: '${key.slice(0, 16)}'`
    return match
  })
  if (text.includes('tenant-functions:') && !text.includes('main-service')) {
    text = text.replace(
      /( {2}tenant-functions:\n(?: {4}.+\n)*?)( {4}ports:\n)/m,
      `$1    command:
      - start
      - --main-service
      - /home/deno/functions/main
$2`
    )
  }
  const publishHost = (process.env.PROVISIONER_PUBLISH_HOST || traefikUpstreamHost).trim()
  // Expose tenant API ports on the docker bridge for Traefik — never publish Postgres (5432).
  text = text.replace(
    /127\.0\.0\.1:(\d+):(3000|9999|5000|4000|9000|6543|8080)\b/g,
    `${publishHost}:$1:$2`
  )
  const remotePgHost = (process.env.PROVISIONER_PG_HOST || '').trim()
  const remotePgPort = (process.env.PROVISIONER_PG_REMOTE_PORT || process.env.PROVISIONER_PG_PORT || '5433').trim()
  if (remotePgHost && !text.includes('tenant-db:')) {
    // Dual-VPS: platform Postgres on control plane; tenant stacks run on backend VPS.
    text = text.replace(/@db:5432/g, `@${remotePgHost}:${remotePgPort}`)
    text = text.replace(/@db:\d+/g, `@${remotePgHost}:${remotePgPort}`)
    text = text.replace(/@indobase-db:5432/g, `@${remotePgHost}:${remotePgPort}`)
    text = text.replace(/@indobase-db:\d+/g, `@${remotePgHost}:${remotePgPort}`)
    text = text.replace(/DB_HOST: 'db'/g, `DB_HOST: '${remotePgHost}'`)
    text = text.replace(/DB_HOST: db\b/g, `DB_HOST: ${remotePgHost}`)
    text = text.replace(/DB_HOST: 'indobase-db'/g, `DB_HOST: '${remotePgHost}'`)
    text = text.replace(/DB_HOST: indobase-db\b/g, `DB_HOST: ${remotePgHost}`)
    if (remotePgPort !== '5432') {
      text = text.replace(new RegExp(`@${remotePgHost}:5432`, 'g'), `@${remotePgHost}:${remotePgPort}`)
      text = text.replace(
        new RegExp(`DB_PORT: '5432'`),
        `DB_PORT: '${remotePgPort}'`
      )
      text = text.replace(
        new RegExp(`DB_HOST: '${remotePgHost}'\\n      DB_PORT: '5432'`, 'g'),
        `DB_HOST: '${remotePgHost}'\n      DB_PORT: '${remotePgPort}'`
      )
    }
  }
  const tenantNet = (
    process.env.PROVISIONER_TENANT_DOCKER_NETWORK ||
    process.env.SAAS_DOCKER_NETWORK_NAME ||
    'indobase-backend-bmqhan_default'
  ).trim()
  if (tenantNet && tenantNet !== 'indobase_default') {
    text = text.replace(/name: indobase_default\b/g, `name: ${tenantNet}`)
  }
  return text
}

const TENANT_FUNCTIONS_MAIN_STUB = `// Minimal Edge Functions router for per-tenant stacks.
Deno.serve(async (req) => {
  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean)
  const serviceName = parts[0]
  if (!serviceName) {
    return new Response(JSON.stringify({ msg: 'missing function name in request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const servicePath = \`/home/deno/functions/\${serviceName}\`
  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath,
      memoryLimitMb: 150,
      workerTimeoutMs: 60_000,
      noModuleCache: false,
      importMapPath: null,
      envVars: Object.entries(Deno.env.toObject()),
    })
    return await worker.fetch(req)
  } catch (e) {
    return new Response(JSON.stringify({ msg: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
`

function seedTenantFunctionsMain(ref) {
  const vol = `indobase-tenant-${ref}_tenant-functions-${ref}`
  // Seed file must be on a path the *host* Docker daemon can bind-mount.
  // Writing only to container /tmp fails (daemon resolves mounts on the host).
  const containerTenantsDir = process.env.PROVISIONER_TENANTS_DIR?.trim() || '/mnt/tenants'
  const hostTenantsDir = process.env.PROVISIONER_TENANTS_HOST_DIR?.trim()
  const seedName = `_seed-fn-main-${ref}.ts`
  const seedInContainer = path.join(containerTenantsDir, seedName)
  const seedOnHost = hostTenantsDir ? path.join(hostTenantsDir, seedName) : seedInContainer
  try {
    fs.mkdirSync(containerTenantsDir, { recursive: true })
    fs.writeFileSync(seedInContainer, TENANT_FUNCTIONS_MAIN_STUB, 'utf8')
  } catch {
    return Promise.resolve(false)
  }
  return new Promise((resolve) => {
    const p = spawn(
      'docker',
      [
        'run',
        '--rm',
        '-v',
        `${vol}:/f`,
        '-v',
        `${seedOnHost}:/seed/index.ts:ro`,
        'alpine',
        'sh',
        '-c',
        'mkdir -p /f/main && rm -rf /f/main/index.ts && cp /seed/index.ts /f/main/index.ts && test -s /f/main/index.ts',
      ],
      { stdio: 'inherit' }
    )
    p.on('exit', (code) => {
      try {
        fs.unlinkSync(seedInContainer)
      } catch {
        // ignore
      }
      resolve(code === 0)
    })
    p.on('error', () => {
      try {
        fs.unlinkSync(seedInContainer)
      } catch {
        // ignore
      }
      resolve(false)
    })
  })
}

function resolveComposeHostPaths(composePath) {
  const containerTenantsDir = process.env.PROVISIONER_TENANTS_DIR?.trim() || '/mnt/tenants'
  const hostTenantsDir = process.env.PROVISIONER_TENANTS_HOST_DIR?.trim()
  const tenantDir = path.dirname(composePath)

  if (!hostTenantsDir || !tenantDir.startsWith(containerTenantsDir)) {
    return { composePath, cwd: tenantDir, projectDirectory: tenantDir }
  }

  const rel = path.relative(containerTenantsDir, tenantDir)
  const hostDir = path.join(hostTenantsDir, rel)
  // `-f` must stay container-readable (CLI opens the file inside the provisioner).
  // `--project-directory` must be the host path so relative bind mounts resolve on the daemon.
  return {
    composePath,
    cwd: tenantDir,
    projectDirectory: hostDir,
  }
}

function runCompose(composePath) {
  const { composePath: containerComposePath, cwd, projectDirectory } =
    resolveComposeHostPaths(composePath)

  return new Promise((resolve, reject) => {
    const p = spawn(
      'docker',
      [
        'compose',
        '--project-directory',
        projectDirectory,
        '-f',
        containerComposePath,
        'up',
        '-d',
        '--remove-orphans',
      ],
      { stdio: 'inherit', cwd }
    )
    p.on('error', reject)
    p.on('exit', (code) => {
      if (code === 0) resolve(undefined)
      else reject(new Error(`docker compose exited with code ${code}`))
    })
  })
}

function runComposeStop(composePath) {
  const { composePath: containerComposePath, cwd, projectDirectory } =
    resolveComposeHostPaths(composePath)

  return new Promise((resolve, reject) => {
    const p = spawn(
      'docker',
      [
        'compose',
        '--project-directory',
        projectDirectory,
        '-f',
        containerComposePath,
        'stop',
      ],
      { stdio: 'inherit', cwd }
    )
    p.on('error', reject)
    p.on('exit', (code) => {
      if (code === 0) resolve(undefined)
      else reject(new Error(`docker compose stop exited with code ${code}`))
    })
  })
}

function runComposeDown(composePath) {
  const { composePath: containerComposePath, cwd, projectDirectory } =
    resolveComposeHostPaths(composePath)

  return new Promise((resolve, reject) => {
    const p = spawn(
      'docker',
      [
        'compose',
        '--project-directory',
        projectDirectory,
        '-f',
        containerComposePath,
        'down',
        '--remove-orphans',
        '-v',
      ],
      { stdio: 'inherit', cwd }
    )
    p.on('error', reject)
    p.on('exit', (code) => {
      if (code === 0) resolve(undefined)
      else reject(new Error(`docker compose down exited with code ${code}`))
    })
  })
}

function dockerVolumeRm(volumeName) {
  return new Promise((resolve) => {
    const p = spawn('docker', ['volume', 'rm', '-f', volumeName], { stdio: 'inherit' })
    p.on('exit', () => resolve(undefined))
    p.on('error', () => resolve(undefined))
  })
}

async function readPublishedPort(ref, serviceSuffix) {
  try {
    const dockerPs = getDockerPsLines()
    return hostPortFor(dockerPs, ref, serviceSuffix)
  } catch {
    return null
  }
}

function spawnSyncText(cmd, args) {
  return new Promise((resolve, reject) => {
    let out = ''
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    p.stdout.on('data', (c) => {
      out += c
    })
    p.on('error', reject)
    p.on('exit', (code) => {
      if (code === 0) resolve(out.trim())
      else reject(new Error(`${cmd} exited ${code}`))
    })
  })
}

function isHealthyProbeStatus(status) {
  // GoTrue /health often returns 405 on HEAD while GET is 200.
  return status === 401 || status === 404 || status === 405 || (status >= 200 && status < 300)
}

async function pingHttp(url, timeoutMs = 8000) {
  try {
    const signal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(timeoutMs)
        : undefined
    const res = await fetch(url, { method: 'HEAD', signal })
    if (isHealthyProbeStatus(res.status)) return true
  } catch {
    // fall through to GET
  }
  try {
    const signal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(timeoutMs)
        : undefined
    const res = await fetch(url, { method: 'GET', signal })
    return isHealthyProbeStatus(res.status)
  } catch {
    return false
  }
}

async function verifyTenantStackHealth(ref) {
  const restPort = await readPublishedPort(ref, 'rest')
  const authPort = await readPublishedPort(ref, 'auth')
  if (restPort && authPort) {
    const [rest, auth] = await Promise.all([
      pingHttp(`http://${traefikUpstreamHost}:${restPort}/`),
      pingHttp(`http://${traefikUpstreamHost}:${authPort}/health`),
    ])
    if (rest && auth) return { ok: true, mode: 'ports', restPort, authPort }
  }
  return { ok: false, mode: 'ports', restPort, authPort }
}

async function syncClusterAuxRolePasswords() {
  const password = auxRolePassword || process.env.POSTGRES_PASSWORD?.trim()
  if (!password) {
    return { ok: false, skipped: true, reason: 'missing_aux_password' }
  }

  const dbContainer = (process.env.PROVISIONER_DB_CONTAINER || 'indobase-db').trim()
  const pgHost = (process.env.PROVISIONER_PG_HOST || '').trim()
  const pgPort = (process.env.PROVISIONER_PG_PORT || '5432').trim()
  const adminUser = (process.env.PROVISIONER_PG_ADMIN_USER || 'supabase_admin').trim()
  const adminPassword = process.env.POSTGRES_PASSWORD?.trim() || password
  const pwLit = `'${password.replace(/'/g, "''")}'`
  const roles = ['authenticator', 'supabase_auth_admin', 'supabase_storage_admin', 'supabase_admin']

  for (const role of roles) {
    if (pgHost) {
      await spawnSyncText('docker', [
        'run',
        '--rm',
        '-e',
        `PGPASSWORD=${adminPassword}`,
        'postgres:16-alpine',
        'psql',
        '-h',
        pgHost,
        '-p',
        pgPort,
        '-U',
        adminUser,
        '-d',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        `alter role ${role} password ${pwLit}`,
      ]).catch(() => undefined)
      continue
    }

    await spawnSyncText('docker', [
      'exec',
      '-e',
      `PGPASSWORD=${adminPassword}`,
      dbContainer,
      'psql',
      '-h',
      '127.0.0.1',
      '-U',
      adminUser,
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `alter role ${role} password ${pwLit}`,
    ]).catch(() => undefined)
  }

  return { ok: true, roles: roles.length }
}

async function repairTenantStackRef(ref, reason) {
  const tenantOutDir = path.join(tenantsDir, ref)
  const composePath = path.join(tenantOutDir, 'docker-compose.yml')
  if (!fs.existsSync(composePath)) {
    return { ref, ok: false, reason: 'compose_missing' }
  }

  const original = fs.readFileSync(composePath, 'utf8')
  const repaired = repairKnownComposeYaml(original)
  assertValidComposeYaml(repaired)
  if (repaired !== original) {
    fs.writeFileSync(composePath, repaired, 'utf8')
  }

  await seedTenantFunctionsMain(ref)
  await runCompose(composePath)

  const traefikPath = path.join(traefikDir, `tenant-${ref}.yml`)
  const isSharedGateway = !fs.existsSync(traefikPath)

  if (isSharedGateway) {
    const portBase = parsePortBaseFromComposeYaml(repaired)
    if (portBase != null) {
      const ports = portsFromPortBase(portBase, repaired.includes('tenant-pooler:'))
      registerSharedGatewayTenant(ref, ports)
    }
  } else {
    const normalized = fixTenantTraefikForRef(ref, traefikDir)
    if (!normalized.ok) {
      return { ref, ok: false, reason: normalized.reason || 'traefik_normalize_failed', repair_reason: reason }
    }
  }

  let siteHosting = null
  try {
    siteHosting = await ensureTenantSiteService({ ref, tenantsDir, traefikDir })
  } catch (error) {
    siteHosting = {
      ok: false,
      ref,
      reason: error instanceof Error ? error.message : 'ensure_site_failed',
    }
  }

  await new Promise((r) => setTimeout(r, 3000))
  const health = await verifyTenantStackHealth(ref)
  return {
    ref,
    ok: health.ok,
    reason: health.ok ? 'repaired' : 'health_check_failed',
    health,
    repair_reason: reason,
    site_hosting: siteHosting,
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/health') return json(res, 200, { ok: true })

    const allowed = new Set([
      '/provision',
      '/provision-shared-gateway',
      '/teardown',
      '/stop',
      '/repair-traefik',
      '/repair-stack',
      '/repair-fleet',
      '/publish-site',
      '/ensure-site-hosting',
      '/ensure-site-fleet',
      '/register-site-route',
    ])
    if (req.method !== 'POST' || !allowed.has(req.url || '')) {
      res.statusCode = 404
      return res.end('not found')
    }

    const auth = String(req.headers.authorization || '')
    if (auth !== `Bearer ${token}`) return json(res, 401, { message: 'Unauthorized' })

    const raw = await readBody(req)
    let body
    try {
      body = JSON.parse(raw || '{}')
    } catch {
      return json(res, 400, { message: 'Invalid JSON' })
    }

    if (req.url === '/repair-fleet') {
      const clusterSync = await syncClusterAuxRolePasswords()
      const results = []
      for (const entry of fs.readdirSync(tenantsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const ref = safeRef(entry.name)
        if (!ref || ref.includes('.')) continue
        try {
          results.push(await repairTenantStackRef(ref, body?.reason || 'repair_fleet'))
        } catch (e) {
          results.push({ ref, ok: false, reason: e?.message || 'repair_failed' })
        }
      }
      const siteResults = await ensureTenantSiteFleet({ tenantsDir, traefikDir })
      const repaired = results.filter((r) => r.ok).length
      const failed = results.filter((r) => !r.ok).length
      const siteReady = siteResults.filter((r) => r.ok).length
      return json(res, 200, {
        ok: true,
        cluster_password_sync: clusterSync,
        repaired,
        failed,
        results,
        site_hosting: { ready: siteReady, results: siteResults },
      })
    }

    if (req.url === '/ensure-site-fleet') {
      const siteResults = await ensureTenantSiteFleet({ tenantsDir, traefikDir })
      const ready = siteResults.filter((r) => r.ok).length
      const failed = siteResults.filter((r) => !r.ok).length
      return json(res, 200, { ok: true, ready, failed, results: siteResults })
    }

    const ref = safeRef(body?.project_ref)
    if (!ref) return json(res, 400, { message: 'Invalid project_ref' })

    const apply = body?.apply !== false

    if (req.url === '/ensure-site-hosting') {
      const result = await ensureTenantSiteService({ ref, tenantsDir, traefikDir })
      return json(res, result.ok ? 200 : 404, result)
    }

    if (req.url === '/register-site-route') {
      const deploymentId = String(body?.deployment_id || '').trim()
      if (!deploymentId) {
        return json(res, 400, { message: 'deployment_id is required' })
      }

      const prefix = body?.prefix != null ? String(body.prefix) : undefined
      const storagePort =
        body?.storage_port != null ? Number(body.storage_port) : await readPublishedPort(ref, 'storage')
      const siteProxyPort = Number(
        body?.site_proxy_port ?? process.env.SITE_STATIC_PROXY_PORT ?? 8790
      )

      const route = registerSiteRoute({
        ref,
        deploymentId,
        prefix,
        storagePort,
        traefikDir,
      })

      const traefik = fixTenantTraefikForRef(ref, traefikDir, { siteProxyPort })

      return json(res, traefik.ok ? 200 : 500, {
        ok: traefik.ok,
        project_ref: ref,
        route_registered: true,
        route,
        traefik,
      })
    }

    if (req.url === '/repair-traefik') {
      const singleRef = safeRef(body?.project_ref)
      if (singleRef) {
        const one = fixTenantTraefikForRef(singleRef, traefikDir)
        return json(res, one.ok ? 200 : 404, one)
      }
      const all = fixAllTenantTraefikFromDocker(traefikDir)
      const fixed = all.filter((r) => r.ok)
      const skipped = all.filter((r) => !r.ok)
      return json(res, 200, { ok: true, fixed: fixed.length, skipped: skipped.length, results: all })
    }

    if (req.url === '/repair-stack') {
      const result = await repairTenantStackRef(ref, body?.reason || 'repair_stack')
      return json(res, result.ok ? 200 : 500, result)
    }

    if (req.url === '/stop') {
      const tenantOutDir = path.join(tenantsDir, ref)
      const composePath = path.join(tenantOutDir, 'docker-compose.yml')
      if (!fs.existsSync(composePath)) {
        return json(res, 404, { ok: false, message: 'compose_missing', project_ref: ref })
      }
      await runComposeStop(composePath)
      return json(res, 200, {
        ok: true,
        project_ref: ref,
        stopped: true,
        reason: body?.reason || 'project_pause',
      })
    }

    if (req.url === '/publish-site') {
      const files = body?.files
      if (!files || typeof files !== 'object' || Array.isArray(files)) {
        return json(res, 400, { message: 'files object is required' })
      }

      const result = await publishTenantSiteFiles({
        files,
        ref,
        tenantsDir,
        traefikDir,
      })

      return json(res, 200, {
        ok: true,
        project_ref: ref,
        ...result,
      })
    }

    if (req.url === '/teardown') {
      const tenantOutDir = path.join(tenantsDir, ref)
      const composePath = path.join(tenantOutDir, 'docker-compose.yml')
      const traefikPath = path.join(traefikDir, `tenant-${ref}.yml`)

      let composeDown = false
      if (apply && fs.existsSync(composePath)) {
        await runComposeDown(composePath)
        composeDown = true
      }

      if (fs.existsSync(traefikPath)) {
        try {
          fs.unlinkSync(traefikPath)
        } catch (e) {
          return json(res, 500, { message: e?.message || 'Failed to remove traefik config' })
        }
      }

      unregisterSharedGatewayTenant(ref)
      removeSiteRoute({ ref, traefikDir })

      const fnVol = `indobase-tenant-${ref}_tenant-functions-${ref}`
      await dockerVolumeRm(fnVol)

      return json(res, 200, {
        ok: true,
        project_ref: ref,
        compose_down: composeDown,
        traefik_removed: true,
        applied: apply,
      })
    }

    if (req.url === '/provision-shared-gateway') {
      const dockerComposeYml = String(body?.docker_compose_yml || '')
      const portBase = Number(body?.data_plane_port_base)
      if (!dockerComposeYml.trim()) {
        return json(res, 400, { message: 'docker_compose_yml is required' })
      }
      if (!Number.isFinite(portBase) || portBase < 1024) {
        return json(res, 400, { message: 'data_plane_port_base is required' })
      }

      assertValidComposeYaml(dockerComposeYml)

      const tenantOutDir = path.join(tenantsDir, ref)
      fs.mkdirSync(tenantOutDir, { recursive: true })
      const composePath = path.join(tenantOutDir, 'docker-compose.yml')
      const traefikPath = path.join(traefikDir, `tenant-${ref}.yml`)
      if (fs.existsSync(traefikPath)) {
        try {
          fs.unlinkSync(traefikPath)
        } catch (e) {
          return json(res, 500, { message: e?.message || 'Failed to remove traefik config' })
        }
      }
      fs.writeFileSync(composePath, dockerComposeYml, 'utf8')

      await seedTenantFunctionsMain(ref)

      if (apply) {
        await runCompose(composePath)
        const ports = portsFromPortBase(portBase, dockerComposeYml.includes('tenant-pooler:'))
        registerSharedGatewayTenant(ref, ports)

        await new Promise((r) => setTimeout(r, 3000))
        const health = await verifyTenantStackHealth(ref)
        if (!health.ok) {
          return json(res, 500, {
            message: 'Shared-gateway sidecars started but health check failed',
            project_ref: ref,
            health,
          })
        }

        return json(res, 200, {
          ok: true,
          project_ref: ref,
          mode: 'shared_gateway',
          written: { composePath },
          ports,
          applied: apply,
          health,
        })
      }

      return json(res, 200, {
        ok: true,
        project_ref: ref,
        mode: 'shared_gateway',
        written: { composePath },
        applied: apply,
      })
    }

    const dockerComposeYml = String(body?.docker_compose_yml || '')
    const traefikYml = String(body?.traefik_yml || '')
    if (!dockerComposeYml.trim() || !traefikYml.trim()) {
      return json(res, 400, { message: 'docker_compose_yml and traefik_yml are required' })
    }

    assertValidComposeYaml(dockerComposeYml)

    const tenantOutDir = path.join(tenantsDir, ref)
    fs.mkdirSync(tenantOutDir, { recursive: true })
    fs.mkdirSync(path.join(tenantOutDir, 'site'), { recursive: true })
    ensureSiteNginxConfFile(path.join(tenantOutDir, 'site-nginx.conf'))

    const composePath = path.join(tenantOutDir, 'docker-compose.yml')
    const traefikPath = path.join(traefikDir, `tenant-${ref}.yml`)

    fs.writeFileSync(composePath, dockerComposeYml, 'utf8')

    await seedTenantFunctionsMain(ref)

    if (apply) {
      await runCompose(composePath)
      const normalized = fixTenantTraefikForRef(ref, traefikDir)
      if (!normalized.ok) {
        console.warn(
          '[provisioner] traefik normalize failed for %s (%s); writing Studio fallback',
          ref,
          normalized.reason
        )
        fs.writeFileSync(traefikPath, traefikYml, 'utf8')
      }

      await new Promise((r) => setTimeout(r, 3000))
      const health = await verifyTenantStackHealth(ref)
      if (!health.ok) {
        return json(res, 500, {
          message: 'Tenant stack started but health check failed',
          project_ref: ref,
          health,
        })
      }

      return json(res, 200, {
        ok: true,
        project_ref: ref,
        written: { composePath, traefikPath },
        applied: apply,
        traefik_normalized: true,
        health,
      })
    }

    fs.writeFileSync(traefikPath, traefikYml, 'utf8')

    return json(res, 200, {
      ok: true,
      project_ref: ref,
      written: { composePath, traefikPath },
      applied: apply,
      traefik_normalized: false,
    })
  } catch (e) {
    return json(res, 500, { message: e?.message || 'Internal error' })
  }
})

if (process.env.SITE_STATIC_PROXY_ENABLED === 'true') {
  startSiteStaticProxy({ traefikDir, upstream: traefikUpstreamHost })
}

server.listen(port, '0.0.0.0', () => {
  console.log(`data-plane-provisioner listening on :${port}`)
})
