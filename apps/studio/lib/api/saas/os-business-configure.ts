/**
 * ConfigureBusiness for OS business.launch — best-effort post-publish setup notes.
 *
 * Persists `saas.projects.auth_config.os_business_config` with SEO/social stubs,
 * robots/sitemap expectation URLs, public URL note, and capability config status
 * for payments / email / analytics when those were ensured.
 *
 * Customer-safe only — no Docker/Traefik/provisioner jargon.
 * Soft-fail: never throw to fail an already-live Launch (caller also soft-fails).
 */
import type { BusinessConfigurePort } from '@indobase/platform'

import { ensureSaasTables, getGotrueUserId, type Claims } from './platform'
import { executeQuery } from './query'
import { getOsWorkspace } from './os-workspace'

export type OsBusinessConfigStatus = 'ready' | 'pending'

export type OsBusinessSeoConfig = {
  title: string
  description: string
  status: OsBusinessConfigStatus
}

export type OsBusinessDiscoveryConfig = {
  robots_url: string
  sitemap_url: string
  /** Expectations recorded for Operate / Verify — not proof the files exist yet. */
  status: OsBusinessConfigStatus
}

export type OsBusinessDomainConfig = {
  public_url: string
  note: string
  status: OsBusinessConfigStatus
}

export type OsBusinessCapabilityConfigStatus = {
  status: OsBusinessConfigStatus
  note?: string
}

export type OsBusinessConfig = {
  configured_at: string
  live_url: string
  workspace_name?: string
  seo: OsBusinessSeoConfig
  discovery: OsBusinessDiscoveryConfig
  domain: OsBusinessDomainConfig
  capabilities?: {
    payments?: OsBusinessCapabilityConfigStatus
    email?: OsBusinessCapabilityConfigStatus
    analytics?: OsBusinessCapabilityConfigStatus
  }
  message: string
}

export type ConfigureOsBusinessInput = {
  workspaceRef: string
  liveUrl: string
  requiredCapabilities?: string[]
  payload?: Record<string, unknown>
  /** Workspace display name override (tests / callers that already loaded it). */
  workspaceName?: string
  gotrueId?: string
  /** When false, skip auth_config write (still returns built config). Default true. */
  persist?: boolean
}

export type ConfigureOsBusinessResult = {
  ok: boolean
  config: OsBusinessConfig
  persist_ok: boolean
  message: string
}

const CONFIGURE_OK_MESSAGE =
  'Business setup notes are saved. Your business is live — SEO and extras can keep improving.'

const CONFIGURE_SOFT_FAIL_MESSAGE =
  "We couldn't finish business setup notes yet. Your business is still live."

function normalizeLiveUrl(liveUrl: string): string {
  const trimmed = liveUrl.trim()
  if (!trimmed) return ''
  try {
    const url = new URL(trimmed)
    url.hash = ''
    url.search = ''
    const path = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '')
    return `${url.origin}${path}`
  } catch {
    return trimmed.replace(/\/+$/, '')
  }
}

function joinUrl(base: string, path: string): string {
  const root = normalizeLiveUrl(base)
  if (!root) return path
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${root}${path.startsWith('/') ? path : `/${path}`}`
}

function capabilitySet(requiredCapabilities?: string[]): Set<string> {
  const set = new Set<string>()
  for (const raw of requiredCapabilities ?? []) {
    if (typeof raw !== 'string') continue
    const key = raw.trim().toLowerCase()
    if (key) set.add(key)
  }
  return set
}

function hasCapability(set: Set<string>, ...aliases: string[]): boolean {
  return aliases.some((a) => set.has(a))
}

function resolveWorkspaceName({
  workspaceName,
  payload,
}: {
  workspaceName?: string
  payload?: Record<string, unknown>
}): string {
  if (typeof workspaceName === 'string' && workspaceName.trim()) {
    return workspaceName.trim().slice(0, 120)
  }
  const fromPayload =
    (typeof payload?.workspace_name === 'string' && payload.workspace_name) ||
    (typeof payload?.workspaceName === 'string' && payload.workspaceName) ||
    (typeof payload?.name === 'string' && payload.name) ||
    ''
  if (fromPayload.trim()) return fromPayload.trim().slice(0, 120)
  return 'My business'
}

function buildSeoStub(workspaceName: string): OsBusinessSeoConfig {
  const title = workspaceName.slice(0, 70)
  const description = `${workspaceName} is live. Update this description anytime for search and social previews.`.slice(
    0,
    160,
  )
  return {
    title,
    description,
    status: 'ready',
  }
}

function buildDiscoveryExpectations(liveUrl: string): OsBusinessDiscoveryConfig {
  return {
    robots_url: joinUrl(liveUrl, '/robots.txt'),
    sitemap_url: joinUrl(liveUrl, '/sitemap.xml'),
    status: 'pending',
  }
}

function buildDomainNote(liveUrl: string): OsBusinessDomainConfig {
  return {
    public_url: liveUrl,
    note: 'Your public URL is assigned. Custom domains can be added later from Indobase OS.',
    status: 'ready',
  }
}

function buildCapabilityStatuses(
  requiredCapabilities?: string[],
): OsBusinessConfig['capabilities'] | undefined {
  const set = capabilitySet(requiredCapabilities)
  const capabilities: NonNullable<OsBusinessConfig['capabilities']> = {}

  if (hasCapability(set, 'payments', 'payment', 'billing', 'commerce', 'checkout')) {
    // Data-plane ensured — checkout setup still pending (do not claim Payments are live).
    capabilities.payments = {
      status: 'pending',
      note: 'Payments backend is ready — finish checkout setup to charge customers.',
    }
  }
  if (hasCapability(set, 'email', 'mail', 'newsletter')) {
    capabilities.email = {
      status: 'pending',
      note: 'Email backend is ready — finish sender setup to send campaigns.',
    }
  }
  if (hasCapability(set, 'analytics', 'tracking', 'metrics')) {
    capabilities.analytics = {
      status: 'ready',
      note: 'Analytics is ready to record visits once traffic starts.',
    }
  }

  return Object.keys(capabilities).length > 0 ? capabilities : undefined
}

/**
 * Merge with an existing os_business_config slice: keep prior discovery URLs if present,
 * refresh SEO/domain/capabilities for this Launch.
 */
export function mergeOsBusinessConfig({
  existing,
  next,
}: {
  existing: unknown
  next: OsBusinessConfig
}): OsBusinessConfig {
  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
    return next
  }
  const prev = existing as Partial<OsBusinessConfig>
  const prevDiscovery =
    prev.discovery && typeof prev.discovery === 'object' ? prev.discovery : null

  const robotsUrl =
    typeof prevDiscovery?.robots_url === 'string' && prevDiscovery.robots_url.trim()
      ? prevDiscovery.robots_url.trim()
      : next.discovery.robots_url
  const sitemapUrl =
    typeof prevDiscovery?.sitemap_url === 'string' && prevDiscovery.sitemap_url.trim()
      ? prevDiscovery.sitemap_url.trim()
      : next.discovery.sitemap_url

  return {
    ...next,
    discovery: {
      robots_url: robotsUrl,
      sitemap_url: sitemapUrl,
      status: next.discovery.status,
    },
  }
}

/** Pure builder — used by tests and the Studio port. */
export function buildOsBusinessConfig(input: {
  liveUrl: string
  workspaceName?: string
  requiredCapabilities?: string[]
  payload?: Record<string, unknown>
  configuredAt?: string
}): OsBusinessConfig {
  const liveUrl = normalizeLiveUrl(input.liveUrl)
  const workspaceName = resolveWorkspaceName({
    workspaceName: input.workspaceName,
    payload: input.payload,
  })
  return {
    configured_at: input.configuredAt ?? new Date().toISOString(),
    live_url: liveUrl,
    workspace_name: workspaceName,
    seo: buildSeoStub(workspaceName),
    discovery: buildDiscoveryExpectations(liveUrl),
    domain: buildDomainNote(liveUrl),
    capabilities: buildCapabilityStatuses(input.requiredCapabilities),
    message: CONFIGURE_OK_MESSAGE,
  }
}

async function loadExistingBusinessConfig({
  workspaceRef,
}: {
  workspaceRef: string
}): Promise<unknown> {
  const result = await executeQuery<{ auth_config: Record<string, unknown> | null }>({
    query: `
      select coalesce(auth_config, '{}'::jsonb) as auth_config
      from saas.projects
      where ref = $1
      limit 1
    `,
    parameters: [workspaceRef],
  })
  const authConfig = result.data?.[0]?.auth_config
  if (!authConfig || typeof authConfig !== 'object') return null
  return authConfig.os_business_config ?? null
}

async function persistBusinessConfig({
  workspaceRef,
  gotrueId,
  config,
}: {
  workspaceRef: string
  gotrueId?: string
  config: OsBusinessConfig
}): Promise<void> {
  await ensureSaasTables()

  if (gotrueId) {
    const result = await executeQuery({
      query: `
        update saas.projects p
        set auth_config = coalesce(p.auth_config, '{}'::jsonb) || jsonb_build_object('os_business_config', $2::jsonb)
        where p.ref = $1
          and exists (
            select 1 from saas.organization_members m
            where m.organization_id = p.organization_id and m.gotrue_id = $3
          )
      `,
      parameters: [workspaceRef, JSON.stringify(config), gotrueId],
      actorId: gotrueId,
    })
    if (result.error) throw result.error
    return
  }

  const result = await executeQuery({
    query: `
      update saas.projects
      set auth_config = coalesce(auth_config, '{}'::jsonb) || jsonb_build_object('os_business_config', $2::jsonb)
      where ref = $1
    `,
    parameters: [workspaceRef, JSON.stringify(config)],
  })
  if (result.error) throw result.error
}

/**
 * Apply best-effort business config after a live publish.
 * Persist failures return ok:false with a customer-safe message (launcher soft-fails).
 */
export async function configureOsBusiness(
  input: ConfigureOsBusinessInput,
): Promise<ConfigureOsBusinessResult> {
  const liveUrl = normalizeLiveUrl(input.liveUrl)
  if (!liveUrl) {
    return {
      ok: false,
      persist_ok: false,
      message: CONFIGURE_SOFT_FAIL_MESSAGE,
      config: buildOsBusinessConfig({
        liveUrl: '',
        workspaceName: input.workspaceName,
        requiredCapabilities: input.requiredCapabilities,
        payload: input.payload,
      }),
    }
  }

  let draft = buildOsBusinessConfig({
    liveUrl,
    workspaceName: input.workspaceName,
    requiredCapabilities: input.requiredCapabilities,
    payload: input.payload,
  })

  try {
    const existing = await loadExistingBusinessConfig({ workspaceRef: input.workspaceRef })
    draft = mergeOsBusinessConfig({ existing, next: draft })
  } catch {
    // Merge is best-effort.
  }

  if (input.persist === false) {
    return {
      ok: true,
      persist_ok: false,
      config: draft,
      message: draft.message,
    }
  }

  try {
    await persistBusinessConfig({
      workspaceRef: input.workspaceRef,
      gotrueId: input.gotrueId,
      config: draft,
    })
    return {
      ok: true,
      persist_ok: true,
      config: draft,
      message: draft.message,
    }
  } catch (error) {
    console.warn(
      '[os-business-configure] persist failed for %s: %s',
      input.workspaceRef,
      error instanceof Error ? error.message : String(error),
    )
    return {
      ok: false,
      persist_ok: false,
      config: draft,
      message: CONFIGURE_SOFT_FAIL_MESSAGE,
    }
  }
}

/**
 * business.launch ConfigureBusiness port — Studio implementation.
 * Always returns ok:true with details so Launch stays live; persist errors are noted in details.
 */
export function createStudioBusinessConfigurePort({
  claims,
}: {
  claims?: Claims
} = {}): BusinessConfigurePort {
  const gotrueId = claims ? getGotrueUserId(claims) : undefined

  return {
    async configure(input) {
      try {
        let workspaceName: string | undefined
        if (claims) {
          try {
            const workspace = await getOsWorkspace({ claims, ref: input.workspaceRef })
            workspaceName = workspace?.name
          } catch {
            workspaceName = undefined
          }
        }

        const result = await configureOsBusiness({
          workspaceRef: input.workspaceRef,
          liveUrl: input.liveUrl,
          requiredCapabilities: input.requiredCapabilities,
          payload: input.payload,
          workspaceName,
          gotrueId,
        })

        // Phase stub: never hard-fail Launch (Publish already marked live).
        return {
          ok: true,
          details: {
            configured: result.ok && result.persist_ok,
            persist_ok: result.persist_ok,
            live_url: result.config.live_url,
            seo_title: result.config.seo.title,
            robots_url: result.config.discovery.robots_url,
            sitemap_url: result.config.discovery.sitemap_url,
            capabilities: result.config.capabilities ?? {},
            message: result.message,
            config: result.config,
          },
        }
      } catch {
        return {
          ok: true,
          details: {
            configured: false,
            persist_ok: false,
            note: 'configure_error',
            message: CONFIGURE_SOFT_FAIL_MESSAGE,
          },
        }
      }
    },
  }
}
