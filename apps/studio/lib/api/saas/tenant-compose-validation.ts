import {
  resolveRemoteDataPlanePgEndpoint,
  resolveTenantDockerNetworkName,
} from './tenant-data-plane-pg'

/**
 * Guards against invalid tenant docker-compose YAML before it is written to disk.
 * Catches regressions like unquoted OAuth redirect suffixes that break `docker compose up`.
 */
export function assertValidTenantComposeYaml(yml: string): void {
  const text = yml.trim()
  if (!text) {
    throw new Error('Tenant docker-compose.yml is empty')
  }

  // Broken pattern: 'https://ref.domain'/auth/v1/callback (suffix outside quotes)
  if (/GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI:\s*'[^']+'\/auth\/v1\/callback/.test(text)) {
    throw new Error(
      'Invalid tenant compose: GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI must include the full callback path inside quotes'
    )
  }

  if (!text.includes('tenant-rest:') || !text.includes('tenant-auth:')) {
    throw new Error('Invalid tenant compose: missing tenant-rest or tenant-auth service')
  }
}

/** Best-effort in-place repair for stacks already written with known-bad patterns. */
export function repairKnownTenantComposeYaml(yml: string): string {
  let text = yml.replace(
    /GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI:\s*'([^']+)'\/auth\/v1\/callback/g,
    "GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI: '$1/auth/v1/callback'"
  )

  const net = resolveTenantDockerNetworkName()
  if (net !== 'indobase_default') {
    text = text.replace(/name: indobase_default\b/g, `name: ${net}`)
  }

  const remote = resolveRemoteDataPlanePgEndpoint()
  if (remote) {
    for (const localHost of ['indobase-db', 'db']) {
      text = text.replace(
        new RegExp(`@${localHost}:5432`, 'g'),
        `@${remote.host}:${remote.port}`,
      )
      text = text.replace(
        new RegExp(`@${localHost}:5433`, 'g'),
        `@${remote.host}:${remote.port}`,
      )
      text = text.replace(
        new RegExp(`DB_HOST: '${localHost}'`, 'g'),
        `DB_HOST: '${remote.host}'`,
      )
      text = text.replace(
        new RegExp(`DB_HOST: ${localHost}\\b`, 'g'),
        `DB_HOST: ${remote.host}`,
      )
      text = text.replace(
        new RegExp(`DB_PORT: '5432'`, 'g'),
        `DB_PORT: '${remote.port}'`,
      )
    }

    text = text.replace(
      new RegExp(`DB_HOST: '${remote.host}'\\n      DB_PORT: '5432'`, 'g'),
      `DB_HOST: '${remote.host}'\n      DB_PORT: '${remote.port}'`,
    )
  }

  return text
}
