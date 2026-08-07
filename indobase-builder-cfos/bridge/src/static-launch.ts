/**
 * Static Launch lane — Indobase subdomain or customer domain.
 * No Studio / provisioner / third-party hosts (Vercel, Netlify, GitHub Pages, Cloudflare Pages).
 */

import { mkdir, writeFile, readFile, access } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

export type StaticLaunchInput = {
  workspaceRef: string
  title?: string
  files?: Record<string, string>
  html?: string
  /** Preferred Indobase subdomain label, e.g. aquaharvest → aquaharvest.indobase.in */
  subdomain?: string
  /** Customer-owned domain, e.g. shop.muthufresh.com */
  customDomain?: string
}

export type DnsInstruction = {
  type: 'CNAME' | 'A' | 'ALIAS'
  name: string
  value: string
  note: string
}

export type StaticLaunchResult = {
  ok: boolean
  status: 'published' | 'failed' | 'pending_dns'
  url?: string
  previewUrl?: string
  subdomain?: string
  customDomain?: string
  dns?: DnsInstruction[]
  message: string
  lane: 'static'
  artifactRef?: string
}

type DomainRecord = {
  hostname: string
  workspaceRef: string
  kind: 'subdomain' | 'custom'
  updatedAt: string
}

type DomainRegistry = {
  version: 1
  byHost: Record<string, DomainRecord>
  byRef: Record<string, { subdomain?: string; customDomain?: string }>
}

export interface StaticDeploymentAdapter {
  prepare(ref: string): Promise<void>
  deploy(input: StaticLaunchInput): Promise<{ artifactRef: string; rootDir: string }>
  assignDomain(
    ref: string,
    opts: { subdomain: string; customDomain?: string },
  ): Promise<{ liveUrl: string; previewUrl: string; dns?: DnsInstruction[] }>
  healthCheck(liveUrl: string): Promise<{ healthy: boolean }>
  rollback(ref: string): Promise<void>
}

function launchRoot(): string {
  return (
    process.env.INDOBASE_LAUNCH_ROOT?.trim() ||
    path.join(process.cwd(), '.indobase-launches')
  )
}

function publicBase(): string {
  const explicit = process.env.INDOBASE_LAUNCH_PUBLIC_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  const port = process.env.PORT || process.env.BUILDER_CFOS_PORT || '8791'
  return `http://127.0.0.1:${port}`
}

function domainSuffix(): string {
  return (process.env.INDOBASE_LAUNCH_DOMAIN_SUFFIX || 'indobase.in').replace(/^\.+/, '').toLowerCase()
}

function cnameTarget(): string {
  return (
    process.env.INDOBASE_LAUNCH_CNAME_TARGET?.trim() || `sites.${domainSuffix()}`
  ).toLowerCase()
}

function sanitizeRef(ref: string): string {
  const cleaned = ref.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
  return cleaned || 'site'
}

export function sanitizeSubdomain(raw: string): string {
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/--+/g, '-')
      .slice(0, 48) || 'site'
  )
}

export function sanitizeHostname(raw: string): string | null {
  const host = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    ?.replace(/\.$/, '')
  if (!host || host.length > 253) return null
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(host)) return null
  if (host.includes('..')) return null
  return host
}

function suggestSubdomain(title: string, ref: string): string {
  const fromTitle = sanitizeSubdomain(title.replace(/\s+/g, '-'))
  if (fromTitle && fromTitle !== 'site') return fromTitle
  return sanitizeSubdomain(ref)
}

function defaultHtml(title: string): string {
  const safe = title.replace(/[<>&]/g, '')
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safe}</title>
  <style>
    :root { --bg:#f7fafc; --ink:#0f172a; --accent:#0d9488; --gold:#c9a227; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: "DM Sans", system-ui, sans-serif; background:var(--bg); color:var(--ink); }
    .hero { min-height:100vh; display:flex; flex-direction:column; justify-content:center; padding:3rem 1.5rem; max-width:40rem; margin:0 auto; }
    h1 { font-size:clamp(2rem,5vw,3rem); letter-spacing:-0.03em; margin:0 0 0.75rem; }
    p { font-size:1.125rem; line-height:1.55; color:#334155; margin:0 0 1.5rem; }
    .badge { display:inline-block; background:var(--gold); color:#111; font-size:0.75rem; font-weight:700; letter-spacing:0.06em; padding:0.35rem 0.65rem; border-radius:999px; margin-bottom:1rem; }
  </style>
</head>
<body>
  <main class="hero">
    <span class="badge">LIVE ON INDOBASE</span>
    <h1>${safe}</h1>
    <p>Your business is live on Indobase. Share this link with customers — no third-party host required.</p>
  </main>
</body>
</html>
`
}

function normalizeFiles(input: StaticLaunchInput): Record<string, string> {
  const out: Record<string, string> = {}
  if (input.files && typeof input.files === 'object') {
    for (const [rawPath, content] of Object.entries(input.files)) {
      if (typeof content !== 'string') continue
      const rel = rawPath.replace(/^\/+/, '').replace(/\.\./g, '')
      if (!rel || rel.length > 200) continue
      out[rel] = content
    }
  }
  if (Object.keys(out).length === 0) {
    const html =
      typeof input.html === 'string' && input.html.trim()
        ? input.html
        : defaultHtml(input.title || input.workspaceRef)
    out['index.html'] = html
  }
  if (!out['index.html'] && !out['index.htm']) {
    const firstHtml = Object.entries(out).find(([p]) => p.endsWith('.html'))
    if (firstHtml) out['index.html'] = firstHtml[1]
    else out['index.html'] = defaultHtml(input.title || input.workspaceRef)
  }
  return out
}

function registryPath(): string {
  return path.join(launchRoot(), 'domains.json')
}

async function loadRegistry(): Promise<DomainRegistry> {
  try {
    const raw = await readFile(registryPath(), 'utf8')
    const parsed = JSON.parse(raw) as DomainRegistry
    if (parsed?.version === 1 && parsed.byHost && parsed.byRef) return parsed
  } catch {
    // fresh
  }
  return { version: 1, byHost: {}, byRef: {} }
}

async function saveRegistry(reg: DomainRegistry): Promise<void> {
  await mkdir(launchRoot(), { recursive: true })
  await writeFile(registryPath(), `${JSON.stringify(reg, null, 2)}\n`, 'utf8')
  await syncCustomDomainTraefikRouters(reg)
}

function traefikDynamicDir(): string | null {
  const dir = process.env.INDOBASE_LAUNCH_TRAEFIK_DYNAMIC_DIR?.trim()
  return dir || null
}

/** Safe Traefik router name fragment from a hostname. */
export function traefikRouterId(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'custom'
}

/**
 * Per-host Traefik routers for verified/attached custom domains.
 * No HostRegexp catch-all (ACME abuse). HTTP-01 via shared letsencrypt resolver.
 */
export function buildCustomDomainTraefikYaml(reg: {
  byHost: Record<string, { hostname: string; kind: string }>
}): string {
  const customs = Object.values(reg.byHost)
    .filter((r) => r.kind === 'custom')
    .sort((a, b) => a.hostname.localeCompare(b.hostname))

  const lines: string[] = [
    '# Auto-generated by Indobase Static Launch — do not edit by hand.',
    '# Custom domains only (CNAME → sites.indobase.in). Subdomains use sites-indobase.yml.',
    '',
  ]

  if (customs.length === 0) {
    lines.push('http:')
    lines.push('  routers: {}')
    lines.push('  services: {}')
    return `${lines.join('\n')}\n`
  }

  lines.push('http:')
  lines.push('  routers:')

  for (const rec of customs) {
    const id = traefikRouterId(rec.hostname)
    const hostRule = `Host(\`${rec.hostname}\`)`
    lines.push(`    indobase-custom-${id}-http:`)
    lines.push(`      rule: ${hostRule}`)
    lines.push('      service: indobase-sites-custom-svc')
    lines.push('      middlewares:')
    lines.push('        - redirect-to-https')
    lines.push('      entryPoints:')
    lines.push('        - web')
    lines.push('      priority: 120')
    lines.push(`    indobase-custom-${id}-https:`)
    lines.push(`      rule: ${hostRule}`)
    lines.push('      service: indobase-sites-custom-svc')
    lines.push('      entryPoints:')
    lines.push('        - websecure')
    lines.push('      priority: 120')
    lines.push('      tls:')
    lines.push('        certResolver: letsencrypt')
  }

  lines.push('  services:')
  lines.push('    indobase-sites-custom-svc:')
  lines.push('      loadBalancer:')
  lines.push('        servers:')
  lines.push('          - url: http://indobase-builder-cfos:8791')
  lines.push('        passHostHeader: true')
  return `${lines.join('\n')}\n`
}

async function syncCustomDomainTraefikRouters(reg: DomainRegistry): Promise<void> {
  const dir = traefikDynamicDir()
  if (!dir) return
  try {
    await mkdir(dir, { recursive: true })
    const yaml = buildCustomDomainTraefikYaml(reg)
    await writeFile(path.join(dir, 'sites-custom-domains.yml'), yaml, 'utf8')
  } catch (err) {
    console.warn('[static-launch] traefik custom-domain sync failed:', err)
  }
}

export async function resolveWorkspaceRefForHost(hostname: string): Promise<string | null> {
  const host = hostname.toLowerCase().split(':')[0]
  if (!host) return null
  const reg = await loadRegistry()
  if (reg.byHost[host]) return reg.byHost[host].workspaceRef

  const suffix = domainSuffix()
  if (host.endsWith(`.${suffix}`)) {
    const sub = host.slice(0, -(suffix.length + 1))
    if (sub && !sub.includes('.')) {
      try {
        await access(path.join(launchRoot(), sub, 'index.html'))
        return sub
      } catch {
        const bySub = Object.entries(reg.byRef).find(([, v]) => v.subdomain === sub)
        if (bySub) return bySub[0]
      }
    }
  }
  return null
}

export async function getLaunchStatus(workspaceRef: string): Promise<{
  subdomain?: string
  customDomain?: string
  previewUrl: string
  url?: string
}> {
  const ref = sanitizeRef(workspaceRef)
  const reg = await loadRegistry()
  const row = reg.byRef[ref] || {}
  const previewUrl = `${publicBase()}/live/${ref}/`
  const suffix = domainSuffix()
  const url = row.customDomain
    ? `https://${row.customDomain}`
    : row.subdomain
      ? `https://${row.subdomain}.${suffix}`
      : previewUrl
  return {
    subdomain: row.subdomain,
    customDomain: row.customDomain,
    previewUrl,
    url,
  }
}

export function createDiskStaticDeploymentAdapter(): StaticDeploymentAdapter {
  return {
    async prepare(ref: string) {
      await mkdir(path.join(launchRoot(), sanitizeRef(ref)), { recursive: true })
    },

    async deploy(input: StaticLaunchInput) {
      const ref = sanitizeRef(input.workspaceRef)
      const dir = path.join(launchRoot(), ref)
      await mkdir(dir, { recursive: true })
      const files = normalizeFiles(input)
      const hash = createHash('sha256')
      for (const [rel, content] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
        const abs = path.join(dir, rel)
        await mkdir(path.dirname(abs), { recursive: true })
        await writeFile(abs, content, 'utf8')
        hash.update(rel)
        hash.update(content)
      }
      return { artifactRef: `static:${ref}:${hash.digest('hex').slice(0, 12)}`, rootDir: dir }
    },

    async assignDomain(ref, opts) {
      const safeRef = sanitizeRef(ref)
      const subdomain = sanitizeSubdomain(opts.subdomain)
      const previewUrl = `${publicBase()}/live/${safeRef}/`
      const suffix = domainSuffix()
      const liveUrl = `https://${subdomain}.${suffix}`
      const reg = await loadRegistry()
      const now = new Date().toISOString()

      for (const [host, rec] of Object.entries(reg.byHost)) {
        if (rec.workspaceRef === safeRef) delete reg.byHost[host]
      }

      reg.byHost[`${subdomain}.${suffix}`] = {
        hostname: `${subdomain}.${suffix}`,
        workspaceRef: safeRef,
        kind: 'subdomain',
        updatedAt: now,
      }
      reg.byRef[safeRef] = { ...(reg.byRef[safeRef] || {}), subdomain }

      let dns: DnsInstruction[] | undefined
      if (opts.customDomain) {
        const custom = sanitizeHostname(opts.customDomain)
        if (!custom) throw new Error('That domain name is not valid')
        if (custom.endsWith(`.${suffix}`)) {
          throw new Error('Pick an Indobase subdomain for *.indobase.in links. Use Connect your domain for a domain you already own.')
        }
        reg.byHost[custom] = {
          hostname: custom,
          workspaceRef: safeRef,
          kind: 'custom',
          updatedAt: now,
        }
        reg.byRef[safeRef] = { ...reg.byRef[safeRef], customDomain: custom }
        dns = [
          {
            type: 'CNAME',
            name: custom.startsWith('www.') ? 'www' : '@',
            value: cnameTarget(),
            note: `At your domain registrar, point ${custom} to ${cnameTarget()}. After DNS updates, customers open https://${custom}. Until then use your Indobase preview link.`,
          },
        ]
      }

      await saveRegistry(reg)
      return { liveUrl, previewUrl, dns }
    },

    async healthCheck(liveUrl: string) {
      try {
        const resp = await fetch(liveUrl, { method: 'GET', redirect: 'follow' })
        return { healthy: resp.ok }
      } catch {
        return { healthy: false }
      }
    },

    async rollback(ref: string) {
      void ref
    },
  }
}

export async function launchStaticBusiness(
  input: StaticLaunchInput,
  adapter: StaticDeploymentAdapter = createDiskStaticDeploymentAdapter(),
): Promise<StaticLaunchResult> {
  const ref = sanitizeRef(input.workspaceRef)
  const subdomain = sanitizeSubdomain(input.subdomain || suggestSubdomain(input.title || '', ref))
  try {
    await adapter.prepare(ref)
    const deployed = await adapter.deploy({ ...input, workspaceRef: ref })
    const assigned = await adapter.assignDomain(ref, {
      subdomain,
      customDomain: input.customDomain,
    })
    void adapter.healthCheck(assigned.previewUrl)

    const customHost = input.customDomain ? sanitizeHostname(input.customDomain) : null
    const hasCustom = Boolean(customHost)
    const usePath =
      process.env.INDOBASE_LAUNCH_USE_PATH_URL === '1' ||
      publicBase().includes('127.0.0.1') ||
      publicBase().includes('localhost')

    const primaryUrl = hasCustom
      ? `https://${customHost}`
      : usePath
        ? assigned.previewUrl
        : assigned.liveUrl

    return {
      ok: true,
      status: hasCustom ? 'pending_dns' : 'published',
      url: primaryUrl,
      previewUrl: assigned.previewUrl,
      subdomain,
      customDomain: customHost || undefined,
      dns: assigned.dns,
      message: hasCustom
        ? `Your business is on Indobase. Add the DNS record below for ${customHost}. Meanwhile open ${assigned.previewUrl}`
        : `Your business is now live — ${primaryUrl}`,
      lane: 'static',
      artifactRef: deployed.artifactRef,
    }
  } catch (err) {
    return {
      ok: false,
      status: 'failed',
      message: err instanceof Error ? err.message : 'Could not go live',
      lane: 'static',
    }
  }
}

export async function readLiveFile(
  ref: string,
  relPath: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  const safeRef = sanitizeRef(ref)
  let rel = (relPath || 'index.html').replace(/^\/+/, '').replace(/\.\./g, '')
  if (!rel || rel.endsWith('/')) rel = `${rel}index.html`.replace(/\/+/g, '/')
  const abs = path.join(launchRoot(), safeRef, rel)
  const root = path.join(launchRoot(), safeRef)
  if (!abs.startsWith(root)) return null
  try {
    await access(abs)
    const body = await readFile(abs)
    return { body, contentType: contentTypeFor(rel) }
  } catch {
    if (!rel.endsWith('index.html')) {
      return readLiveFile(ref, path.posix.join(path.posix.dirname(rel), 'index.html'))
    }
    return null
  }
}

function contentTypeFor(filePath: string): string {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html; charset=utf-8'
  if (lower.endsWith('.css')) return 'text/css; charset=utf-8'
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'text/javascript; charset=utf-8'
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.txt')) return 'text/plain; charset=utf-8'
  return 'application/octet-stream'
}

/** @deprecated Prefer LAUNCH_AGENT_HARD_RULES from @indobase/cloudflare-adapter */
export const LAUNCH_AGENT_RULES = `
## Go Live / Launch Business (HARD PATH — mandatory)
When the operator asks to take live / launch / publish / go public:
1. Call launchBusiness (POST /api/os/tools/launchBusiness or POST /api/os/launch) with REAL html or files — never empty.
2. Default: https://{subdomain}.indobase.in — or local preview /live/{ref}/.
3. Optional customDomain: domain they already own. DNS CNAME → sites.indobase.in. Hosting stays on Indobase.
4. ONLY claim live after API returns ok:true AND url. NEVER invent a URL. NEVER third-party hosts.
5. Reply: "Your business is now live" + the exact API url (and DNS if connecting their domain).
6. Capabilities: Enable ≠ Connect — “Login enabled”, never “Connect Neon/Stripe/…”.
`.trim()
