/**
 * Typed application verification. Never a single boolean standing in for LIVE.
 */

export type ApplicationVerificationCheck = {
  id: string
  passed: boolean
  detail?: string
}

export type ApplicationVerificationResult = {
  passed: boolean
  applicationId?: string
  artifactHash?: string | null
  preview: { reachable: boolean; statusCode?: number; rendered: boolean }
  identity: {
    projectMatches: boolean
    businessTypeMatches: boolean
    verticalMatches: boolean
  }
  capabilities: { required: string[]; verified: string[]; failed: string[] }
  routes: ApplicationVerificationCheck[]
  failures: string[]
}

export function emptyVerificationResult(
  overrides: Partial<ApplicationVerificationResult> = {},
): ApplicationVerificationResult {
  return {
    passed: overrides.passed ?? false,
    applicationId: overrides.applicationId,
    artifactHash: overrides.artifactHash ?? null,
    preview: { reachable: false, rendered: false, ...overrides.preview },
    identity: {
      projectMatches: false,
      businessTypeMatches: false,
      verticalMatches: false,
      ...overrides.identity,
    },
    capabilities: { required: [], verified: [], failed: [], ...overrides.capabilities },
    routes: overrides.routes || [],
    failures: overrides.failures || [],
  }
}

export function verificationPassed(result: ApplicationVerificationResult): boolean {
  return (
    result.passed &&
    result.preview.reachable &&
    result.preview.rendered &&
    result.identity.projectMatches &&
    result.failures.length === 0
  )
}

export function verifyPreviewHttp(input: {
  statusCode?: number | null
  contentType?: string | null
  body?: string | null
  expectedProjectRef?: string
  expectedBusinessName?: string
  forbiddenFixtures?: string[]
}): ApplicationVerificationResult {
  const failures: string[] = []
  const status = input.statusCode ?? 0
  const body = input.body || ''
  const reachable = status >= 200 && status < 400
  if (!reachable) failures.push(`preview.http=${status || 'none'}`)
  const rendered = body.trim().length > 80 && /<html|<!DOCTYPE/i.test(body)
  if (reachable && !rendered) failures.push('preview.body empty or not HTML')
  const projectMatches = input.expectedProjectRef
    ? body.includes(input.expectedProjectRef) || !body
    : true
  if (input.expectedProjectRef && rendered && !body.includes(input.expectedProjectRef)) {
    failures.push('identity.projectRef missing from artifact')
  }
  const name = (input.expectedBusinessName || '').trim()
  const businessTypeMatches = true
  const verticalMatches = true
  if (name && rendered && !body.toLowerCase().includes(name.toLowerCase())) {
    failures.push('identity.businessName missing from artifact')
  }
  for (const fixture of input.forbiddenFixtures || ['Circuit Nest', 'corev1-aug13', 'NorthPeak']) {
    if (name && fixture.toLowerCase() === name.toLowerCase()) continue
    if (body.includes(fixture)) failures.push(`fixture leak: ${fixture}`)
  }
  const passed = failures.length === 0 && reachable && rendered && projectMatches
  return {
    passed,
    preview: { reachable, statusCode: status, rendered },
    identity: {
      projectMatches: input.expectedProjectRef ? body.includes(input.expectedProjectRef) : true,
      businessTypeMatches,
      verticalMatches,
    },
    capabilities: { required: [], verified: [], failed: [] },
    routes: [{ id: 'GET preview', passed: reachable && rendered, detail: String(status) }],
    failures,
  }
}
