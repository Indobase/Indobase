/**
 * Post-launch verification for Indobase OS Operate loop.
 *
 * Goes beyond the execution.publish HealthCheck (live URL HEAD/GET) with
 * homepage / robots / sitemap / health-path probes and capability-aware
 * auth login smoke stubs. Customer-safe messages only — no infra leakage.
 *
 * Hard vs soft:
 * - Hard: homepage unreachable when `strictVerify` is true (artifact publish)
 * - Soft: robots/sitemap missing or unhealthy, optional health paths, auth deferred
 *
 * Hosting-only empty sites should pass `strictVerify: false` so a blank 404
 * homepage does not fail Launch.
 */

export type OsLaunchVerifyCheckStatus = 'passed' | 'failed' | 'skipped' | 'deferred'

/** Hard failures gate Launch; soft issues are warnings only. */
export type OsLaunchVerifySeverity = 'hard' | 'soft'

export type OsLaunchVerifyCheck = {
  id: string
  label: string
  status: OsLaunchVerifyCheckStatus
  severity: OsLaunchVerifySeverity
  /** Customer-safe message (never Docker/Traefik/provisioner). */
  message: string
  details?: {
    path?: string
    status_code?: number
    method?: string
  }
}

export type OsLaunchVerifyResult = {
  /**
   * False only when hard failures exist under the active policy.
   * Soft warnings never flip this to false.
   */
  passed: boolean
  checks: OsLaunchVerifyCheck[]
  /** Hard failures that fail Launch when strictVerify is on. */
  failures: OsLaunchVerifyCheck[]
  /** Soft issues (optional paths, deferred auth, hosting-only homepage skip). */
  warnings: OsLaunchVerifyCheck[]
  verifiedAt: string
  liveUrl: string
  strictVerify: boolean
}

export type OsLaunchVerifyOptions = {
  liveUrl: string
  /** Capabilities that were ensured during Launch (e.g. auth). */
  ensuredCapabilities?: string[]
  /**
   * When true (default), homepage unreachable is a hard failure.
   * When false (hosting-only empty sites), homepage unreachability is soft/skipped.
   */
  strictVerify?: boolean
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 5000

const HEALTH_PATHS = ['/api/health', '/api/health/live', '/health', '/healthz'] as const

const CUSTOMER_UNREACHABLE =
  "We couldn't confirm your homepage is responding yet. Please try again in a moment."

const HOSTING_ONLY_HOMEPAGE_SKIP =
  'Homepage check skipped for hosting-only launch — your live link is reserved; content may still be empty.'

function normalizeLiveUrl(liveUrl: string): string {
  const trimmed = liveUrl.trim()
  if (!trimmed) return ''
  try {
    const url = new URL(trimmed)
    url.hash = ''
    url.search = ''
    // Drop trailing slash for join consistency (except origin root).
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

function isOkStatus(status: number): boolean {
  return status >= 200 && status < 400
}

function abortSignal(timeoutMs: number): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs)
  }
  return undefined
}

async function probeUrl({
  url,
  fetchImpl,
  timeoutMs,
  methods = ['HEAD', 'GET'],
}: {
  url: string
  fetchImpl: typeof fetch
  timeoutMs: number
  methods?: Array<'HEAD' | 'GET'>
}): Promise<{ ok: boolean; status?: number; method?: string; error?: string }> {
  let lastError = 'request failed'
  for (const method of methods) {
    try {
      const response = await fetchImpl(url, {
        method,
        cache: 'no-store',
        redirect: 'follow',
        signal: abortSignal(timeoutMs),
      })
      if (isOkStatus(response.status)) {
        return { ok: true, status: response.status, method }
      }
      // HEAD often 405 — try GET next.
      if (method === 'HEAD' && (response.status === 405 || response.status === 501)) {
        lastError = `upstream responded ${response.status}`
        continue
      }
      return { ok: false, status: response.status, method, error: `upstream responded ${response.status}` }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'request failed'
    }
  }
  return { ok: false, error: lastError }
}

/**
 * Probe optional discovery paths.
 * Missing (404/410) → skipped soft warning.
 * Present but error status → failed soft warning (never hard).
 * Network errors on optional paths → skipped soft.
 */
async function probeOptionalPath({
  liveUrl,
  path,
  fetchImpl,
  timeoutMs,
  id,
  label,
  presentMessage,
  missingMessage,
}: {
  liveUrl: string
  path: string
  fetchImpl: typeof fetch
  timeoutMs: number
  id: string
  label: string
  presentMessage: string
  missingMessage: string
}): Promise<OsLaunchVerifyCheck> {
  const url = joinUrl(liveUrl, path)
  const probe = await probeUrl({ url, fetchImpl, timeoutMs, methods: ['GET'] })

  if (probe.ok) {
    return {
      id,
      label,
      status: 'passed',
      severity: 'soft',
      message: presentMessage,
      details: { path, status_code: probe.status, method: probe.method },
    }
  }

  if (probe.status === 404 || probe.status === 410) {
    return {
      id,
      label,
      status: 'skipped',
      severity: 'soft',
      message: missingMessage,
      details: { path, status_code: probe.status, method: probe.method },
    }
  }

  // Network / unexpected — treat optional paths as skipped so hosting-only sites pass.
  if (probe.status == null) {
    return {
      id,
      label,
      status: 'skipped',
      severity: 'soft',
      message: missingMessage,
      details: { path },
    }
  }

  return {
    id,
    label,
    status: 'failed',
    severity: 'soft',
    message: `We found ${path} but it isn't responding correctly yet.`,
    details: { path, status_code: probe.status, method: probe.method },
  }
}

function authWasEnsured(ensuredCapabilities?: string[]): boolean {
  if (!ensuredCapabilities?.length) return false
  return ensuredCapabilities.some((c) => {
    const key = c.trim().toLowerCase()
    return key === 'auth' || key === 'login'
  })
}

function buildAuthSmokeCheck(ensuredCapabilities?: string[]): OsLaunchVerifyCheck {
  if (!authWasEnsured(ensuredCapabilities)) {
    return {
      id: 'auth_login_smoke',
      label: 'Login smoke',
      status: 'skipped',
      severity: 'soft',
      message: 'Login check skipped — auth was not required for this launch.',
    }
  }
  return {
    id: 'auth_login_smoke',
    label: 'Login smoke',
    status: 'deferred',
    severity: 'soft',
    message:
      'Login smoke is deferred in this phase. Auth was enabled; a full sign-in check will run in a later Operate release.',
  }
}

async function probeFirstPresentHealthPath({
  liveUrl,
  fetchImpl,
  timeoutMs,
}: {
  liveUrl: string
  fetchImpl: typeof fetch
  timeoutMs: number
}): Promise<OsLaunchVerifyCheck> {
  let sawPresentFailure: OsLaunchVerifyCheck | null = null

  for (const path of HEALTH_PATHS) {
    const url = joinUrl(liveUrl, path)
    const probe = await probeUrl({ url, fetchImpl, timeoutMs, methods: ['GET'] })

    if (probe.ok) {
      return {
        id: 'health_endpoint',
        label: 'Health endpoint',
        status: 'passed',
        severity: 'soft',
        message: 'A health endpoint is responding.',
        details: { path, status_code: probe.status, method: probe.method },
      }
    }

    if (probe.status != null && probe.status !== 404 && probe.status !== 410) {
      sawPresentFailure = {
        id: 'health_endpoint',
        label: 'Health endpoint',
        status: 'failed',
        severity: 'soft',
        message: 'A health endpoint was found but is not healthy yet.',
        details: { path, status_code: probe.status, method: probe.method },
      }
      // Keep scanning in case another path is healthy.
    }
  }

  if (sawPresentFailure) return sawPresentFailure

  return {
    id: 'health_endpoint',
    label: 'Health endpoint',
    status: 'skipped',
    severity: 'soft',
    message: 'No health endpoint found — skipped for static sites.',
  }
}

function isSoftWarning(check: OsLaunchVerifyCheck): boolean {
  if (check.severity !== 'soft') return false
  return (
    check.status === 'failed' ||
    check.status === 'skipped' ||
    check.status === 'deferred'
  )
}

/**
 * Run post-launch verification against a live business URL.
 * Homepage reachability is a hard gate when `strictVerify` is true; optional paths are soft.
 */
export async function verifyOsLaunch(options: OsLaunchVerifyOptions): Promise<OsLaunchVerifyResult> {
  const liveUrl = normalizeLiveUrl(options.liveUrl)
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const strictVerify = options.strictVerify !== false
  const verifiedAt = new Date().toISOString()
  const checks: OsLaunchVerifyCheck[] = []

  if (!liveUrl) {
    const failed: OsLaunchVerifyCheck = {
      id: 'homepage',
      label: 'Homepage',
      status: 'failed',
      severity: strictVerify ? 'hard' : 'soft',
      message: strictVerify ? CUSTOMER_UNREACHABLE : HOSTING_ONLY_HOMEPAGE_SKIP,
    }
    const failures = failed.severity === 'hard' ? [failed] : []
    const warnings = failed.severity === 'soft' ? [failed] : []
    return {
      passed: failures.length === 0,
      checks: [failed],
      failures,
      warnings,
      verifiedAt,
      liveUrl: options.liveUrl,
      strictVerify,
    }
  }

  // 1) Homepage — hard when strictVerify; soft/skipped for hosting-only
  const home = await probeUrl({
    url: joinUrl(liveUrl, '/'),
    fetchImpl,
    timeoutMs,
    methods: ['GET', 'HEAD'],
  })
  if (home.ok) {
    checks.push({
      id: 'homepage',
      label: 'Homepage',
      status: 'passed',
      severity: 'hard',
      message: 'Your homepage is responding.',
      details: { path: '/', status_code: home.status, method: home.method },
    })
  } else if (strictVerify) {
    checks.push({
      id: 'homepage',
      label: 'Homepage',
      status: 'failed',
      severity: 'hard',
      message: CUSTOMER_UNREACHABLE,
      details: home.status != null ? { path: '/', status_code: home.status, method: home.method } : { path: '/' },
    })
  } else {
    checks.push({
      id: 'homepage',
      label: 'Homepage',
      status: 'skipped',
      severity: 'soft',
      message: HOSTING_ONLY_HOMEPAGE_SKIP,
      details: home.status != null ? { path: '/', status_code: home.status, method: home.method } : { path: '/' },
    })
  }

  // 2) robots.txt (optional / soft)
  checks.push(
    await probeOptionalPath({
      liveUrl,
      path: '/robots.txt',
      fetchImpl,
      timeoutMs,
      id: 'robots',
      label: 'robots.txt',
      presentMessage: 'robots.txt is available.',
      missingMessage: 'No robots.txt yet — skipped.',
    }),
  )

  // 3) sitemap (optional / soft — try common names)
  const sitemapPaths = ['/sitemap.xml', '/sitemap_index.xml']
  let sitemapCheck: OsLaunchVerifyCheck | null = null
  for (const path of sitemapPaths) {
    const check = await probeOptionalPath({
      liveUrl,
      path,
      fetchImpl,
      timeoutMs,
      id: 'sitemap',
      label: 'Sitemap',
      presentMessage: 'A sitemap is available.',
      missingMessage: 'No sitemap yet — skipped.',
    })
    if (check.status === 'passed') {
      sitemapCheck = check
      break
    }
    if (check.status === 'failed') {
      sitemapCheck = check
      break
    }
    sitemapCheck = check
  }
  if (sitemapCheck) checks.push(sitemapCheck)

  // 4) Health endpoints (optional / soft)
  checks.push(await probeFirstPresentHealthPath({ liveUrl, fetchImpl, timeoutMs }))

  // 5) Auth login smoke (capability-aware stub / soft)
  checks.push(buildAuthSmokeCheck(options.ensuredCapabilities))

  const failures = checks.filter((c) => c.status === 'failed' && c.severity === 'hard')
  const warnings = checks.filter(isSoftWarning)
  const passed = failures.length === 0

  return {
    passed,
    checks,
    failures,
    warnings,
    verifiedAt,
    liveUrl,
    strictVerify,
  }
}

/** Persist-friendly summary for auth_config.os_launch_verify */
export function summarizeOsLaunchVerify(result: OsLaunchVerifyResult): Record<string, unknown> {
  return {
    passed: result.passed,
    strict_verify: result.strictVerify,
    verified_at: result.verifiedAt,
    live_url: result.liveUrl,
    check_ids: result.checks.map((c) => ({
      id: c.id,
      status: c.status,
      severity: c.severity,
    })),
    failure_ids: result.failures.map((c) => c.id),
    failure_messages: result.failures.map((c) => c.message),
    warning_ids: result.warnings.map((c) => c.id),
    warning_messages: result.warnings.map((c) => c.message),
  }
}

/**
 * Resolve whether homepage hard-gating applies.
 * Explicit flag / env wins; hosting-only publish defaults soft.
 */
export function resolveStrictVerify({
  explicit,
  publishKind,
  envValue = typeof process !== 'undefined' ? process.env.OS_LAUNCH_STRICT_VERIFY : undefined,
}: {
  explicit?: boolean
  /** From os_publish.kind after MarkLive (`artifact` | `hosting-only`). */
  publishKind?: string | null
  envValue?: string | undefined
} = {}): boolean {
  if (typeof explicit === 'boolean') return explicit

  const env = typeof envValue === 'string' ? envValue.trim().toLowerCase() : ''
  if (env === 'true' || env === '1' || env === 'yes') return true
  if (env === 'false' || env === '0' || env === 'no') return false

  if (publishKind === 'hosting-only') return false
  // Artifact publish (and unknown) → hard homepage gate by default.
  return true
}
