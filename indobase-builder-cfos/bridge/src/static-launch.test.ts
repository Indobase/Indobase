import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  launchStaticBusiness,
  createDiskStaticDeploymentAdapter,
  readLiveFile,
  resolveWorkspaceRefForHost,
  sanitizeSubdomain,
  buildCustomDomainTraefikYaml,
  traefikRouterId,
  LAUNCH_AGENT_RULES,
} from './static-launch.ts'
import {
  executeLaunchBusinessTool,
  launchBusinessToolCatalog,
  LAUNCH_AGENT_HARD_RULES,
} from './launch-business-tool.ts'
import { readFile } from 'node:fs/promises'

describe('static launch lane', () => {
  it('publishes with Indobase subdomain metadata without Studio', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'indobase-launch-'))
    process.env.INDOBASE_LAUNCH_ROOT = dir
    process.env.INDOBASE_LAUNCH_PUBLIC_URL = 'http://127.0.0.1:8791'
    process.env.INDOBASE_LAUNCH_DOMAIN_SUFFIX = 'indobase.in'
    try {
      const result = await launchStaticBusiness({
        workspaceRef: 'local_poc',
        title: 'AquaHarvest Marketplace',
        subdomain: 'aquaharvest',
        files: {
          'index.html': '<html><body><h1>AquaHarvest</h1></body></html>',
        },
      })
      assert.equal(result.ok, true)
      assert.equal(result.lane, 'static')
      assert.equal(result.subdomain, 'aquaharvest')
      assert.equal(result.previewUrl, 'http://127.0.0.1:8791/live/local_poc/')
      assert.ok(result.url)
      assert.match(result.message, /live/i)
      assert.doesNotMatch(result.message, /studio|vercel|netlify|github pages|cloudflare pages/i)

      const file = await readLiveFile('local_poc', 'index.html')
      assert.ok(file)
      assert.match(file.body.toString('utf8'), /AquaHarvest/)

      const ref = await resolveWorkspaceRefForHost('aquaharvest.indobase.in')
      assert.equal(ref, 'local_poc')
    } finally {
      await rm(dir, { recursive: true, force: true })
      delete process.env.INDOBASE_LAUNCH_ROOT
      delete process.env.INDOBASE_LAUNCH_PUBLIC_URL
      delete process.env.INDOBASE_LAUNCH_DOMAIN_SUFFIX
    }
  })

  it('auto-allocates a unique subdomain when the brand label is taken', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'indobase-launch-'))
    process.env.INDOBASE_LAUNCH_ROOT = dir
    process.env.INDOBASE_LAUNCH_PUBLIC_URL = 'http://127.0.0.1:8791'
    process.env.INDOBASE_LAUNCH_DOMAIN_SUFFIX = 'indobase.in'
    try {
      const first = await launchStaticBusiness({
        workspaceRef: 'biz_a',
        title: 'UrbanThread',
        subdomain: 'urbanthread',
        files: { 'index.html': '<html><body>A</body></html>' },
      })
      assert.equal(first.ok, true)
      assert.equal(first.subdomain, 'urbanthread')
      const second = await launchStaticBusiness({
        workspaceRef: 'roshfdaaf13e89',
        title: 'UrbanThread',
        subdomain: 'urbanthread',
        files: { 'index.html': '<html><body>B</body></html>' },
      })
      assert.equal(second.ok, true)
      assert.notEqual(second.subdomain, 'urbanthread')
      assert.match(second.subdomain || '', /urbanthread-/)
      assert.notEqual(second.url, first.url)
    } finally {
      await rm(dir, { recursive: true, force: true })
      delete process.env.INDOBASE_LAUNCH_ROOT
      delete process.env.INDOBASE_LAUNCH_PUBLIC_URL
      delete process.env.INDOBASE_LAUNCH_DOMAIN_SUFFIX
    }
  })

  it('accepts a customer domain and returns DNS instructions', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'indobase-launch-'))
    const traefikDir = await mkdtemp(path.join(os.tmpdir(), 'indobase-traefik-'))
    process.env.INDOBASE_LAUNCH_ROOT = dir
    process.env.INDOBASE_LAUNCH_PUBLIC_URL = 'http://127.0.0.1:8791'
    process.env.INDOBASE_LAUNCH_CNAME_TARGET = 'sites.indobase.in'
    process.env.INDOBASE_LAUNCH_TRAEFIK_DYNAMIC_DIR = traefikDir
    try {
      const result = await launchStaticBusiness({
        workspaceRef: 'local_poc',
        title: 'AquaHarvest',
        subdomain: 'aquaharvest',
        customDomain: 'www.muthufresh.com',
        html: '<html><body>ok</body></html>',
      })
      assert.equal(result.ok, true)
      assert.equal(result.status, 'pending_dns')
      assert.equal(result.customDomain, 'www.muthufresh.com')
      assert.ok(result.dns && result.dns[0])
      assert.equal(result.dns[0].value, 'sites.indobase.in')
      assert.doesNotMatch(JSON.stringify(result.dns), /vercel|netlify|github|cloudflare pages/i)

      const ref = await resolveWorkspaceRefForHost('www.muthufresh.com')
      assert.equal(ref, 'local_poc')

      const yaml = await readFile(path.join(traefikDir, 'sites-custom-domains.yml'), 'utf8')
      assert.match(yaml, /Host\(`www\.muthufresh\.com`\)/)
      assert.match(yaml, /certResolver: letsencrypt/)
      assert.doesNotMatch(yaml, /HostRegexp/)
    } finally {
      await rm(dir, { recursive: true, force: true })
      await rm(traefikDir, { recursive: true, force: true })
      delete process.env.INDOBASE_LAUNCH_ROOT
      delete process.env.INDOBASE_LAUNCH_PUBLIC_URL
      delete process.env.INDOBASE_LAUNCH_CNAME_TARGET
      delete process.env.INDOBASE_LAUNCH_TRAEFIK_DYNAMIC_DIR
    }
  })

  it('builds empty custom-domain Traefik yaml without catch-all', () => {
    const yaml = buildCustomDomainTraefikYaml({ byHost: {} })
    assert.match(yaml, /routers: \{\}/)
    assert.doesNotMatch(yaml, /HostRegexp/)
    assert.equal(traefikRouterId('www.Example.com'), 'www-example-com')
  })

  it('sanitizes subdomain labels', () => {
    assert.equal(sanitizeSubdomain('Aqua Harvest!!!'), 'aqua-harvest')
  })

  it('adapter is swappable shape', async () => {
    const adapter = createDiskStaticDeploymentAdapter()
    assert.equal(typeof adapter.deploy, 'function')
    assert.equal(typeof adapter.assignDomain, 'function')
    assert.equal(typeof adapter.rollback, 'function')
  })

  it('re-deploy drops the superseded bundle but keeps assets an html-only deploy still needs', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'indobase-prune-'))
    process.env.INDOBASE_LAUNCH_ROOT = dir
    try {
      const adapter = createDiskStaticDeploymentAdapter()
      await adapter.deploy({
        workspaceRef: 'ws_prune',
        files: {
          'index.html': '<script src="./assets/index-AAAAAAAA.js"></script>',
          'assets/index-AAAAAAAA.js': 'old',
          'assets/logo.png': 'png',
        },
      })
      await adapter.deploy({
        workspaceRef: 'ws_prune',
        files: {
          'index.html': '<script src="./assets/index-BBBBBBBB.js"></script>',
          'assets/index-BBBBBBBB.js': 'new',
        },
      })

      assert.equal(await readLiveFile('ws_prune', 'assets/index-AAAAAAAA.js'), null)
      assert.ok(await readLiveFile('ws_prune', 'assets/index-BBBBBBBB.js'))
      assert.ok(await readLiveFile('ws_prune', 'assets/logo.png'))

      await adapter.deploy({
        workspaceRef: 'ws_prune',
        files: { 'index.html': '<script src="./assets/index-BBBBBBBB.js"></script>' },
      })
      assert.ok(await readLiveFile('ws_prune', 'assets/index-BBBBBBBB.js'))
    } finally {
      delete process.env.INDOBASE_LAUNCH_ROOT
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('agent hard rules forbid inventing live URLs', () => {
    assert.match(LAUNCH_AGENT_HARD_RULES, /HARD PATH/i)
    assert.match(LAUNCH_AGENT_HARD_RULES, /launchBusiness/)
    assert.match(LAUNCH_AGENT_HARD_RULES, /NEVER invent/i)
    assert.match(LAUNCH_AGENT_HARD_RULES, /sites\.indobase\.in/)
    assert.match(LAUNCH_AGENT_HARD_RULES, /Enable ≠ Connect/)
    assert.match(LAUNCH_AGENT_RULES, /HARD PATH/i)
  })
})

describe('launchBusiness tool (hard path)', () => {
  it('catalog points at same-origin launchBusiness wrapping /api/os/launch', () => {
    const catalog = launchBusinessToolCatalog()
    assert.equal(catalog.name, 'launchBusiness')
    assert.equal(catalog.path, '/api/os/tools/launchBusiness')
    assert.equal(catalog.alias_path, '/api/os/tools/goLive')
    assert.equal(catalog.wraps, '/api/os/launch')
    assert.ok(catalog.aliases.includes('goLive'))
  })

  it('rejects empty html/files without claiming live', async () => {
    const result = await executeLaunchBusinessTool('ws_empty', {
      title: 'Empty',
      subdomain: 'empty',
    })
    assert.equal(result.ok, false)
    assert.equal(result.status, 'rejected')
    assert.equal(result.claim_live, false)
    assert.equal(result.url, undefined)
    assert.match(result.message, /html or files/i)
  })

  it('rejects saas go live without backend', async () => {
    const result = await executeLaunchBusinessTool(
      'ws_saas',
      {
        app_type: 'saas',
        html: '<html><body>App</body></html>',
      },
      { backend: null },
    )
    assert.equal(result.ok, false)
    assert.equal(result.code, 'backend_required')
    assert.equal(result.claim_live, false)
  })

  it('injects backend env into published html', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'indobase-launch-env-'))
    process.env.INDOBASE_LAUNCH_ROOT = dir
    process.env.INDOBASE_LAUNCH_PUBLIC_URL = 'http://127.0.0.1:8791'
    process.env.INDOBASE_LAUNCH_DOMAIN_SUFFIX = 'indobase.in'
    try {
      const result = await executeLaunchBusinessTool(
        'ws_env',
        {
          html: '<html><head></head><body><h1>App</h1></body></html>',
          subdomain: 'envtest',
        },
        {
          backend: {
            api_url: 'https://ws-env.indobase.in',
            anon_key: 'anon-test',
            auth_url: 'https://ws-env.indobase.in/auth/v1',
            rest_url: 'https://ws-env.indobase.in/rest/v1/',
            storage_url: 'https://ws-env.indobase.in/storage/v1',
            project_ref: 'ws_env',
            project_name: 'Env',
            project_url: 'https://studio.indobase.in/project/ws_env/backend',
          },
        },
      )
      assert.equal(result.ok, true)
      const file = await readLiveFile('ws_env', 'index.html')
      assert.ok(file)
      assert.match(file.body.toString('utf8'), /__INDOBASE_ENV__/)
      assert.match(file.body.toString('utf8'), /ws-env\.indobase\.in/)
    } finally {
      await rm(dir, { recursive: true, force: true })
      delete process.env.INDOBASE_LAUNCH_ROOT
      delete process.env.INDOBASE_LAUNCH_PUBLIC_URL
      delete process.env.INDOBASE_LAUNCH_DOMAIN_SUFFIX
    }
  })

  it('publishes real html and sets claim_live only with API url', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'indobase-launch-tool-'))
    process.env.INDOBASE_LAUNCH_ROOT = dir
    process.env.INDOBASE_LAUNCH_PUBLIC_URL = 'http://127.0.0.1:8791'
    process.env.INDOBASE_LAUNCH_DOMAIN_SUFFIX = 'indobase.in'
    try {
      const result = await executeLaunchBusinessTool(
        'ws_tool',
        {
          title: 'AquaHarvest',
          subdomain: 'aquaharvest',
          html: '<html><body><h1>Live</h1></body></html>',
        },
        { title: 'fallback' },
      )
      assert.equal(result.ok, true)
      assert.equal(result.claim_live, true)
      assert.equal(result.tool, 'launchBusiness')
      assert.ok(result.url)
      assert.doesNotMatch(result.url || '', /vercel|netlify|github\.io/i)
      assert.match(result.message, /live/i)
    } finally {
      await rm(dir, { recursive: true, force: true })
      delete process.env.INDOBASE_LAUNCH_ROOT
      delete process.env.INDOBASE_LAUNCH_PUBLIC_URL
      delete process.env.INDOBASE_LAUNCH_DOMAIN_SUFFIX
    }
  })
})
