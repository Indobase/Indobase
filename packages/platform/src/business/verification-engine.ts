/**
 * First-class VerificationEngine — not an applyOperatorIntent executor.
 * Executors CALL this service. Chat must not invent pass/fail.
 *
 * Preview verification is HTTP + HTML identity + boot markers.
 * Never iframe.contentDocument (cross-origin SecurityError is expected).
 */

export type VerificationCheckStatus = 'pass' | 'fail' | 'skip'

export type VerificationCheck = {
  id: string
  status: VerificationCheckStatus
  severity: 'blocking' | 'warning'
  message: string
  evidence?: string
}

export type VerificationPack = 'core' | 'ecommerce' | 'saas' | 'landing'

export type VerificationInput = {
  pack: VerificationPack
  projectRef: string
  artifactHash?: string | null
  expectedArtifactHash?: string | null
  applicationType?: string | null
  httpStatus?: number | null
  contentType?: string | null
  html?: string | null
  bootMarker?: boolean
  commerceBound?: boolean
  catalogHttpOk?: boolean | null
  productRendered?: boolean | null
  cartOk?: boolean | null
  checkoutOk?: boolean | null
  orderOk?: boolean | null
  orderVisible?: boolean | null
  authOk?: boolean | null
  persistenceOk?: boolean | null
  workflowOk?: boolean | null
  forbiddenFixtures?: string[]
  expectedBusinessName?: string | null
}

export type VerificationResult = {
  passed: boolean
  /** Preview may pass with skipped optional probes. Production must not. */
  productionPassed: boolean
  artifactHash: string | null
  projectRef: string
  pack: VerificationPack
  checks: VerificationCheck[]
  failures: string[]
}

function check(
  id: string,
  ok: boolean,
  message: string,
  severity: VerificationCheck['severity'] = 'blocking',
  evidence?: string,
): VerificationCheck {
  return { id, status: ok ? 'pass' : 'fail', severity, message, evidence }
}

function skip(id: string, message: string): VerificationCheck {
  return { id, status: 'skip', severity: 'warning', message }
}

export function runVerificationEngine(input: VerificationInput): VerificationResult {
  const html = input.html || ''
  const checks: VerificationCheck[] = []
  const status = input.httpStatus ?? 0
  const reachable = status >= 200 && status < 400
  checks.push(check('http', reachable, reachable ? 'HTTP ok' : `HTTP ${status || 'none'}`, 'blocking', String(status)))
  const htmlOk = html.trim().length > 80 && /<html|<!DOCTYPE/i.test(html)
  checks.push(check('html', htmlOk, htmlOk ? 'HTML present' : 'HTML empty or not a document'))
  const projectOk = !htmlOk || !input.projectRef || html.includes(input.projectRef)
  checks.push(check('identity.projectRef', projectOk, 'projectRef in artifact'))
  if (input.expectedArtifactHash) {
    const hashOk = html.includes(input.expectedArtifactHash) || input.artifactHash === input.expectedArtifactHash
    checks.push(check('identity.artifactHash', hashOk, 'artifact hash matches'))
  }
  const boot = input.bootMarker === true || /data-ib-boot|INDOBASE_PREVIEW_READY|__IB_PREVIEW_BOOT__/i.test(html)
  checks.push(check('boot', boot && htmlOk, 'preview boot marker', htmlOk ? 'warning' : 'blocking'))
  const fixtures = input.forbiddenFixtures || ['Circuit Nest', 'corev1-aug13']
  const name = (input.expectedBusinessName || '').trim()
  let fixtureOk = true
  for (const fixture of fixtures) {
    if (name && fixture.toLowerCase() === name.toLowerCase()) continue
    if (html.includes(fixture)) fixtureOk = false
  }
  checks.push(check('identity.fixtures', fixtureOk, 'no stale fixture identity'))

  const pack = input.pack
  if (pack === 'ecommerce') {
    const commerce = input.commerceBound === true || /indobase\.commerce|\/api\/os\/commerce/i.test(html)
    checks.push(check('commerce.abi', commerce, 'commerce ABI bound'))
    if (input.catalogHttpOk === false) {
      checks.push(check('commerce.catalog', false, 'catalog API not reachable'))
    } else if (input.catalogHttpOk === true) {
      checks.push(check('commerce.catalog', true, 'catalog API reachable'))
    } else {
      checks.push(skip('commerce.catalog', 'catalog HTTP not probed'))
    }
    const rendered = input.productRendered
    if (rendered === false) checks.push(check('commerce.product', false, 'product not rendered in artifact'))
    else if (rendered === true) checks.push(check('commerce.product', true, 'product rendered'))
    else checks.push(skip('commerce.product', 'product render not probed'))
    const cart = input.cartOk
    if (cart === false) checks.push(check('commerce.cart', false, 'cart did not accept variantId'))
    else if (cart === true) checks.push(check('commerce.cart', true, 'cart accepts variantId'))
    else checks.push(skip('commerce.cart', 'cart not probed'))
    const checkout = input.checkoutOk
    if (checkout === false) checks.push(check('commerce.checkout', false, 'checkout API failed'))
    else if (checkout === true) checks.push(check('commerce.checkout', true, 'checkout API 200'))
    else checks.push(skip('commerce.checkout', 'checkout not probed'))
    const order = input.orderOk
    if (order === false) checks.push(check('commerce.order', false, 'order not created'))
    else if (order === true) checks.push(check('commerce.order', true, 'order created'))
    else checks.push(skip('commerce.order', 'order not probed'))
    const visible = input.orderVisible
    if (visible === false) checks.push(check('commerce.order.visible', false, 'order not visible through runtime'))
    else if (visible === true) checks.push(check('commerce.order.visible', true, 'order visible through runtime'))
    else checks.push(skip('commerce.order.visible', 'order visibility not probed'))
  } else if (pack === 'saas') {
    checks.push(skip('commerce.abi', 'saas does not require commerce'))
    if (input.authOk === false) checks.push(check('saas.auth', false, 'auth probe failed'))
    else if (input.authOk === true) checks.push(check('saas.auth', true, 'auth probe passed'))
    else checks.push(skip('saas.auth', 'auth not probed'))
    if (input.workflowOk === false) checks.push(check('saas.workflow', false, 'workflow probe failed'))
    else if (input.workflowOk === true) checks.push(check('saas.workflow', true, 'workflow probe passed'))
    else checks.push(skip('saas.workflow', 'workflow not probed'))
    if (input.persistenceOk === false) checks.push(check('saas.persistence', false, 'persistence probe failed'))
    else if (input.persistenceOk === true) checks.push(check('saas.persistence', true, 'persistence probe passed'))
    else checks.push(skip('saas.persistence', 'persistence not probed'))
  } else {
    checks.push(skip('commerce.abi', `${pack} does not require commerce`))
    if (pack === 'landing' && /indobase\.commerce/i.test(html)) {
      checks.push(check('landing.no_commerce', false, 'landing must not bind commerce ABI'))
    }
  }

  const failures = checks.filter((c) => c.status === 'fail' && c.severity === 'blocking').map((c) => `${c.id}: ${c.message}`)
  const passed = failures.length === 0 && reachable && htmlOk
  return {
    passed,
    productionPassed: productionVerificationPassed({ pack, checks, failures, passed, artifactHash: input.artifactHash || input.expectedArtifactHash || null, projectRef: input.projectRef }),
    artifactHash: input.artifactHash || input.expectedArtifactHash || null,
    projectRef: input.projectRef,
    pack,
    checks,
    failures,
  }
}

export const REQUIRED_PRODUCTION_PROBE_IDS: Record<VerificationPack, readonly string[]> = {
  core: ['http', 'html', 'boot'],
  landing: ['http', 'html', 'identity.projectRef', 'boot'],
  ecommerce: [
    'http',
    'html',
    'identity.projectRef',
    'boot',
    'commerce.abi',
    'commerce.catalog',
    'commerce.product',
    'commerce.cart',
    'commerce.checkout',
    'commerce.order',
    'commerce.order.visible',
  ],
  saas: ['http', 'html', 'identity.projectRef', 'boot', 'saas.auth', 'saas.workflow', 'saas.persistence'],
}

export function productionVerificationPassed(result: Pick<VerificationResult, 'pack' | 'checks' | 'failures' | 'passed' | 'artifactHash' | 'projectRef'>): boolean {
  if (!result.passed) return false
  const required = REQUIRED_PRODUCTION_PROBE_IDS[result.pack] || REQUIRED_PRODUCTION_PROBE_IDS.core
  for (const id of required) {
    const check = result.checks.find((c) => c.id === id)
    if (!check || check.status !== 'pass') return false
  }
  return true
}

export function artifactHashChainHolds(input: {
  verifiedArtifactHash?: string | null
  deployedArtifactHash?: string | null
  liveArtifactHash?: string | null
}): boolean {
  const a = (input.verifiedArtifactHash || '').trim()
  const b = (input.deployedArtifactHash || '').trim()
  const c = (input.liveArtifactHash || '').trim()
  return Boolean(a && a === b && b === c)
}

export const ECOMMERCE_PROOF_CHAIN = [
  'http',
  'boot',
  'commerce.catalog',
  'commerce.product',
  'commerce.cart',
  'commerce.checkout',
  'commerce.order',
  'commerce.order.visible',
] as const

export function verificationPackForBusinessType(type?: string | null): VerificationPack {
  const t = String(type || '').toLowerCase()
  if (t === 'saas' || t === 'app') return 'saas'
  if (t === 'landing' || t === 'website') return 'landing'
  return 'ecommerce'
}
