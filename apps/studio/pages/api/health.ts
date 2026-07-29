import type { NextApiRequest, NextApiResponse } from 'next'

import { executeQuery } from 'lib/api/saas/query'
import { decryptString, encryptString } from 'lib/api/saas/util'
import { getLogflareBaseUrl } from 'lib/constants/api'

type CheckResult = {
  status: 'ok' | 'degraded'
  message?: string
}

type HealthResponse = {
  status: 'ok' | 'degraded'
  service: 'studio'
  timestamp: string
  // Commit SHA the image was built from. Baked in at Docker build time via the BUILD_SHA
  // build-arg (see Dockerfile + .github/workflows/docker-publish.yml). Post-deploy smoke
  // tests assert this equals the just-pushed commit to catch stale-image deploys.
  version: string
  checks: {
    env: CheckResult & { missing?: string[] }
    /** SaaS control plane: env vars + live postgres-meta query (skipped when NEXT_PUBLIC_INDOBASE_SAAS=false) */
    saasInfra: CheckResult & { missing?: string[] }
    /** SaaS: verify AES keys can decrypt a stored project secret (skipped when SaaS disabled) */
    cryptoCanary?: CheckResult
    gotrue: CheckResult
    rest: CheckResult
    /** Self-hosted Logflare (skipped when logs disabled or not configured) */
    logflare?: CheckResult
  }
}

const REQUIRED_ENV_VARS = ['NEXT_PUBLIC_INDOBASE_SAAS', 'NEXT_PUBLIC_SITE_URL', 'SUPABASE_URL'] as const

function isSaaSMode() {
  return process.env.NEXT_PUBLIC_INDOBASE_SAAS !== 'false'
}

function checkSaaSInfraEnv(): { missing: string[]; message?: string } {
  const missing: string[] = []
  if (!process.env.STUDIO_PG_META_URL?.trim()) {
    missing.push('STUDIO_PG_META_URL')
  }
  if (!process.env.POSTGRES_PASSWORD?.trim()) {
    missing.push('POSTGRES_PASSWORD')
  }
  const cryptoConfigured = Boolean(
    process.env.PG_META_CRYPTO_KEY?.trim() || process.env.CRYPTO_KEY?.trim()
  )
  if (!cryptoConfigured) {
    missing.push('encryption key')
  }

  if (missing.length > 0) {
    return {
      missing,
      message:
        'SaaS platform APIs need postgres-meta (STUDIO_PG_META_URL), project encryption keys, and POSTGRES_PASSWORD — see docker/ENV-FOR-OWN-BACKEND.md',
    }
  }

  return { missing: [] }
}

async function checkSaaSInfra(): Promise<HealthResponse['checks']['saasInfra']> {
  if (!isSaaSMode()) {
    return { status: 'ok' }
  }

  const envCheck = checkSaaSInfraEnv()
  if (envCheck.missing.length > 0) {
    return {
      status: 'degraded',
      missing: envCheck.missing,
      message: envCheck.message,
    }
  }

  const metaUrl = process.env.STUDIO_PG_META_URL?.trim() ?? ''
  const looksLikePublicApi =
    /api\.indobase\.in|indobase-kong|:8000\/|\/pg\b/i.test(metaUrl) && !/meta|8080|8081/i.test(metaUrl)
  const looksLikePostgresMeta =
    /meta/i.test(metaUrl) ||
    /:8080\b|:8081\b/.test(metaUrl) ||
    /^https?:\/\/(127\.0\.0\.1|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(metaUrl)
  if (metaUrl && looksLikePublicApi && !looksLikePostgresMeta) {
    return {
      status: 'degraded',
      message:
        `STUDIO_PG_META_URL looks wrong (${metaUrl}): use postgres-meta on the Docker network (http://indobase-meta:8080) or host-published port (http://172.17.0.1:8081) — not Kong.`,
    }
  }

  const probe = await executeQuery<{ ok: number }>({ query: 'select 1 as ok' })
  if (probe.error) {
    const raw = probe.error.message
    const hint =
      /unauthorized/i.test(raw)
        ? 'Studio encryption settings must exactly match the postgres-meta service. Restart studio and meta after fixing.'
        : raw
    return {
      status: 'degraded',
      message: `postgres-meta query failed: ${hint}`,
    }
  }

  return { status: 'ok' }
}

async function checkCryptoCanary(): Promise<NonNullable<HealthResponse['checks']['cryptoCanary']>> {
  if (!isSaaSMode()) {
    return { status: 'ok' }
  }

  const envCheck = checkSaaSInfraEnv()
  if (envCheck.missing.length > 0) {
    return { status: 'degraded', message: 'encryption keys not configured' }
  }

  try {
    const probe = 'indobase-crypto-canary'
    if (decryptString(encryptString(probe)) !== probe) {
      return { status: 'degraded', message: 'encryption round-trip failed' }
    }

    const sample = await executeQuery<{ anon_key_enc: string | null }>({
      query: `select anon_key_enc from saas.projects where anon_key_enc is not null limit 1`,
    })
    if (sample.error) {
      return { status: 'degraded', message: 'could not load encrypted project sample' }
    }

    const ciphertext = sample.data?.[0]?.anon_key_enc?.trim()
    if (ciphertext) {
      const plain = decryptString(ciphertext)
      if (!plain) {
        return {
          status: 'degraded',
          message: 'configured encryption keys cannot decrypt stored project secrets',
        }
      }
    }

    return { status: 'ok' }
  } catch {
    return {
      status: 'degraded',
      message: 'configured encryption keys cannot decrypt stored project secrets',
    }
  }
}

function isLogsEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_ENABLE_LOGS?.trim().toLowerCase()
  return raw === 'true' || raw === '1'
}

async function checkLogflare(): Promise<HealthResponse['checks']['logflare']> {
  if (!isLogsEnabled()) {
    return { status: 'ok' }
  }

  const baseUrl = getLogflareBaseUrl()
  const privateToken = process.env.LOGFLARE_PRIVATE_ACCESS_TOKEN?.trim()
  const missing: string[] = []
  if (!baseUrl) missing.push('LOGFLARE_URL')
  if (!privateToken) missing.push('LOGFLARE_PRIVATE_ACCESS_TOKEN')

  if (missing.length > 0) {
    return {
      status: 'degraded',
      message: `logs enabled but missing ${missing.join(', ')} — run docker/scripts/sync-logflare-env-to-studio.sh on VPS`,
    }
  }

  try {
    const timeoutSignal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(3000)
        : undefined

    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: timeoutSignal,
    })
    if (!response.ok) {
      return { status: 'degraded', message: `logflare responded ${response.status}` }
    }
    return { status: 'ok' }
  } catch (error) {
    return {
      status: 'degraded',
      message:
        error instanceof Error
          ? `cannot reach logflare at ${baseUrl}: ${error.message}`
          : 'logflare health check failed',
    }
  }
}

function resolveGoTrueBaseUrl() {
  if (process.env.GOTRUE_URL) return process.env.GOTRUE_URL
  if (process.env.NEXT_PUBLIC_GOTRUE_URL) return process.env.NEXT_PUBLIC_GOTRUE_URL
  if (process.env.SUPABASE_URL) return `${process.env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`
  return undefined
}

async function ping(url: string): Promise<CheckResult> {
  try {
    const timeoutSignal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(3000)
        : undefined

    const response = await fetch(url, {
      method: 'HEAD',
      cache: 'no-store',
      signal: timeoutSignal,
    })
    // Kong/PostgREST often return 401 on unauthenticated HEAD; that still means the service is up.
    if (!response.ok && response.status !== 401) {
      return { status: 'degraded', message: `upstream responded ${response.status}` }
    }
    return { status: 'ok' }
  } catch (error) {
    return {
      status: 'degraded',
      message: error instanceof Error ? error.message : 'request failed',
    }
  }
}

export async function computeHealth(): Promise<HealthResponse> {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]?.trim())
  const envCheck: HealthResponse['checks']['env'] =
    missing.length === 0
      ? { status: 'ok' }
      : { status: 'degraded', missing, message: 'missing required environment variables' }

  const gotrueBaseUrl = resolveGoTrueBaseUrl()
  const gotrueCheck: CheckResult = gotrueBaseUrl
    ? await ping(`${gotrueBaseUrl.replace(/\/$/, '')}/health`)
    : { status: 'degraded', message: 'GoTrue URL is not configured' }

  const restBaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '')
  const restCheck: CheckResult = restBaseUrl
    ? await ping(`${restBaseUrl}/rest/v1/`)
    : { status: 'degraded', message: 'SUPABASE_URL is not configured' }

  const saasInfraCheck = await checkSaaSInfra()
  const cryptoCanaryCheck = await checkCryptoCanary()
  const logflareCheck = await checkLogflare()

  const checks = {
    env: envCheck,
    saasInfra: saasInfraCheck,
    cryptoCanary: cryptoCanaryCheck,
    gotrue: gotrueCheck,
    rest: restCheck,
    ...(logflareCheck ? { logflare: logflareCheck } : {}),
  }

  const status: HealthResponse['status'] = Object.values(checks).every((c) => c.status === 'ok')
    ? 'ok'
    : 'degraded'

  return {
    status,
    service: 'studio',
    timestamp: new Date().toISOString(),
    version: process.env.BUILD_SHA || 'unknown',
    checks,
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<HealthResponse>) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', ['GET', 'HEAD'])
    return res.status(405).end()
  }

  let payload: HealthResponse
  try {
    payload = await computeHealth()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'health check failed'
    payload = {
      status: 'degraded',
      service: 'studio',
      timestamp: new Date().toISOString(),
      version: process.env.BUILD_SHA || 'unknown',
      checks: {
        env: { status: 'degraded', message },
        saasInfra: { status: 'degraded', message },
        gotrue: { status: 'degraded', message },
        rest: { status: 'degraded', message },
      },
    }
  }

  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'HEAD') {
    return res.status(payload.status === 'ok' ? 200 : 503).end()
  }

  return res.status(payload.status === 'ok' ? 200 : 503).json(payload)
}
