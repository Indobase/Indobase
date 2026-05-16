/**
 * Minimal data-plane provisioner.
 *
 * Responsibilities:
 * - Authenticate requests from Studio using a shared token.
 * - Write per-project `docker-compose.yml` and `traefik.yml` to mounted host paths.
 * - Optionally run `docker compose up -d` for that tenant stack.
 *
 * Required env:
 *   PROVISIONER_TOKEN
 *   PROVISIONER_TENANTS_DIR=/mnt/tenants
 *   PROVISIONER_TRAEFIK_DYNAMIC_DIR=/mnt/traefik
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const token = process.env.PROVISIONER_TOKEN || ''
const tenantsDir = process.env.PROVISIONER_TENANTS_DIR || '/mnt/tenants'
const traefikDir = process.env.PROVISIONER_TRAEFIK_DYNAMIC_DIR || '/mnt/traefik'
const port = Number(process.env.PORT || '8787')

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
      if (data.length > 5_000_000) {
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
  const tmp = path.join('/tmp', `fn-main-${ref}.ts`)
  fs.writeFileSync(tmp, TENANT_FUNCTIONS_MAIN_STUB, 'utf8')
  return new Promise((resolve) => {
    const p = spawn(
      'docker',
      [
        'run',
        '--rm',
        '-v',
        `${vol}:/f`,
        '-v',
        `${tmp}:/seed/index.ts:ro`,
        'alpine',
        'sh',
        '-c',
        'mkdir -p /f/main && cp /seed/index.ts /f/main/index.ts',
      ],
      { stdio: 'inherit' }
    )
    p.on('exit', () => {
      try {
        fs.unlinkSync(tmp)
      } catch {
        // ignore
      }
      resolve(undefined)
    })
    p.on('error', () => resolve(undefined))
  })
}

function runCompose(composePath) {
  return new Promise((resolve, reject) => {
    const p = spawn(
      'docker',
      ['compose', '-f', composePath, 'up', '-d', '--remove-orphans'],
      { stdio: 'inherit' }
    )
    p.on('error', reject)
    p.on('exit', (code) => {
      if (code === 0) resolve(undefined)
      else reject(new Error(`docker compose exited with code ${code}`))
    })
  })
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/health') return json(res, 200, { ok: true })

    if (req.method !== 'POST' || req.url !== '/provision') {
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

    const ref = safeRef(body?.project_ref)
    if (!ref) return json(res, 400, { message: 'Invalid project_ref' })

    const dockerComposeYml = String(body?.docker_compose_yml || '')
    const traefikYml = String(body?.traefik_yml || '')
    if (!dockerComposeYml.trim() || !traefikYml.trim()) {
      return json(res, 400, { message: 'docker_compose_yml and traefik_yml are required' })
    }

    const apply = body?.apply !== false

    const tenantOutDir = path.join(tenantsDir, ref)
    fs.mkdirSync(tenantOutDir, { recursive: true })

    const composePath = path.join(tenantOutDir, 'docker-compose.yml')
    const traefikPath = path.join(traefikDir, `tenant-${ref}.yml`)

    fs.writeFileSync(composePath, dockerComposeYml, 'utf8')
    fs.writeFileSync(traefikPath, traefikYml, 'utf8')

    await seedTenantFunctionsMain(ref)

    if (apply) {
      await runCompose(composePath)
    }

    return json(res, 200, {
      ok: true,
      project_ref: ref,
      written: { composePath, traefikPath },
      applied: apply,
    })
  } catch (e) {
    return json(res, 500, { message: e?.message || 'Internal error' })
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`data-plane-provisioner listening on :${port}`)
})

