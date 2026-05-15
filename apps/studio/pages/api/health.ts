import type { NextApiRequest, NextApiResponse } from 'next'

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
    /** SaaS control plane: postgres-meta + Postgres credentials (skipped when NEXT_PUBLIC_INDOBASE_SAAS=false) */
    saasInfra: CheckResult & { missing?: string[] }
    gotrue: CheckResult
    rest: CheckResult
  }
}

const REQUIRED_ENV_VARS = ['NEXT_PUBLIC_INDOBASE_SAAS', 'NEXT_PUBLIC_SITE_URL', 'SUPABASE_URL'] as const

function isSaaSMode() {
  return process.env.NEXT_PUBLIC_INDOBASE_SAAS !== 'false'
}

function checkSaaSInfra(): HealthResponse['checks']['saasInfra'] {
  if (!isSaaSMode()) {
    return { status: 'ok' }
  }

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
    missing.push('PG_META_CRYPTO_KEY')
  }

  if (missing.length > 0) {
    return {
      status: 'degraded',
      missing,
      message:
        'SaaS platform APIs need postgres-meta (STUDIO_PG_META_URL), matching PG_META_CRYPTO_KEY, and POSTGRES_PASSWORD — see docker/ENV-FOR-OWN-BACKEND.md',
    }
  }

  return { status: 'ok' }
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
    if (!response.ok) {
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

  const saasInfraCheck = checkSaaSInfra()

  const checks = {
    env: envCheck,
    saasInfra: saasInfraCheck,
    gotrue: gotrueCheck,
    rest: restCheck,
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

  const payload = await computeHealth()
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'HEAD') {
    return res.status(payload.status === 'ok' ? 200 : 503).end()
  }

  return res.status(payload.status === 'ok' ? 200 : 503).json(payload)
}
