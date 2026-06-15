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
  return yml.replace(
    /GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI:\s*'([^']+)'\/auth\/v1\/callback/g,
    "GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI: '$1/auth/v1/callback'"
  )
}
