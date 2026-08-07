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
