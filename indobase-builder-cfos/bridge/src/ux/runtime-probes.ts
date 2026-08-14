/**
 * Runtime probes against the running application (HTTP), not iframe DOM.
 * Inject getJson in tests. Production uses fetch.
 */

export type ProbeHttp = {
  getJson: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
    status: number
    json: Record<string, unknown>
    text: string
  }>
  commerceBaseUrl: string
}

export type EcommerceProbeResult = {
  catalogHttpOk: boolean
  productRendered: boolean
  cartOk: boolean
  checkoutOk: boolean
  orderOk: boolean
  orderVisible: boolean
  evidence: string[]
}

export type SaasProbeResult = {
  authOk: boolean
  workflowOk: boolean
  persistenceOk: boolean
  evidence: string[]
}

function parseProbeBody(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return { text }
  }
}

/** Same-process commerce ABI. Do not use the public hostname (TLS/DNS flaps). */
export function createLiveProbeHttp(): ProbeHttp {
  const port = process.env.PORT || process.env.BUILDER_CFOS_PORT || '8791'
  const commerceBaseUrl = `http://127.0.0.1:${port}/api/os/commerce`
  return {
    commerceBaseUrl,
    getJson: async (url, init) => {
      const res = await fetch(url, {
        method: init?.method || 'GET',
        headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
        body: init?.body,
      })
      const text = await res.text()
      return { status: res.status, json: parseProbeBody(text), text }
    },
  }
}

export async function defaultProbeHttp(_baseUrl: string): Promise<ProbeHttp['getJson']> {
  return createLiveProbeHttp().getJson
}

function productAppearsInHtml(html: string, product: Record<string, unknown>): boolean {
  if (!html) return false
  const hay = html.toLowerCase()
  const name = String(product.name || '').trim().toLowerCase()
  const id = String(product.id || '').trim().toLowerCase()
  const slug = String(product.slug || '').trim().toLowerCase()
  return Boolean((name && hay.includes(name)) || (id && hay.includes(id)) || (slug && hay.includes(slug)))
}

export async function probeEcommerceHttp(
  projectRef: string,
  http: ProbeHttp,
  html = '',
): Promise<EcommerceProbeResult> {
  const evidence: string[] = []
  const base = http.commerceBaseUrl.replace(/\/+$/, '')
  const headers = { 'X-Indobase-Project-Ref': projectRef }
  const catalogUrl = `${base}/products?projectRef=${encodeURIComponent(projectRef)}`
  const catalog = await http.getJson(catalogUrl, { headers })
  const products = Array.isArray(catalog.json.products) ? (catalog.json.products as Array<Record<string, unknown>>) : []
  const catalogHttpOk = catalog.status >= 200 && catalog.status < 400 && products.length > 0
  evidence.push(`catalog HTTP ${catalog.status} count=${products.length}`)
  const product = products[0] || {}
  const variants = Array.isArray(product.variants) ? (product.variants as Array<Record<string, unknown>>) : []
  const variantId = String(variants[0]?.id || product.variantId || '')
  const productId = String(product.id || '')
  const productRendered = catalogHttpOk && productAppearsInHtml(html, product)
  evidence.push(productRendered ? `product rendered ${productId}` : 'product not in artifact HTML')
  let cartOk = false
  if (catalogHttpOk && variantId && productId) {
    const withoutVariant = await http.getJson(`${base}/checkout`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectRef,
        items: [{ productId, quantity: 1 }],
        customer: { email: 'verify@indobase.in' },
        idempotencyKey: `verify_novar_${projectRef}_${Date.now()}`,
      }),
    })
    const rejectedMissingVariant =
      withoutVariant.status >= 400 || withoutVariant.json.ok === false
    cartOk = rejectedMissingVariant
    evidence.push(
      cartOk
        ? `cart requires variantId (reject HTTP ${withoutVariant.status})`
        : 'checkout accepted items without variantId',
    )
  } else {
    evidence.push('cart missing variantId')
  }
  let checkoutOk = false
  let orderOk = false
  let orderVisible = false
  if (cartOk) {
    const checkout = await http.getJson(`${base}/checkout`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectRef,
        items: [{ productId, variantId, quantity: 1 }],
        customer: { email: 'verify@indobase.in' },
        idempotencyKey: `verify_${projectRef}_${Date.now()}`,
      }),
    })
    checkoutOk = checkout.status >= 200 && checkout.status < 400 && checkout.json.ok !== false
    const order = (checkout.json.order || checkout.json) as Record<string, unknown>
    const orderId = String(order.id || order.orderId || '')
    evidence.push(`checkout HTTP ${checkout.status} order=${orderId || 'none'}`)
    orderOk = checkoutOk && Boolean(orderId)
    if (orderId) {
      const got = await http.getJson(`${base}/orders/${encodeURIComponent(orderId)}?projectRef=${encodeURIComponent(projectRef)}`, { headers })
      const gotOrder = (got.json.order || got.json) as Record<string, unknown>
      const visibleId = String(gotOrder.id || gotOrder.orderId || '')
      orderVisible = got.status >= 200 && got.status < 400 && got.json.ok !== false && visibleId === orderId
      evidence.push(`order HTTP ${got.status} visible=${orderVisible}`)
    } else {
      evidence.push('order id missing from checkout; not treating checkout JSON as order visibility')
    }
  }
  return {
    catalogHttpOk,
    productRendered,
    cartOk,
    checkoutOk,
    orderOk,
    orderVisible,
    evidence,
  }
}

export async function probeSaasHttp(
  projectRef: string,
  http: ProbeHttp,
  html: string,
): Promise<SaasProbeResult> {
  const evidence: string[] = []
  const authOk = /auth-with-otp|indobase\.auth/i.test(html)
  evidence.push(authOk ? 'auth ABI present' : 'auth ABI missing')
  const workflowOk = /__INDOBASE_ENV__|\/api\/collections\//i.test(html) && authOk
  evidence.push(workflowOk ? 'workflow ABI present' : 'workflow ABI missing')
  const base = http.commerceBaseUrl.replace(/\/+$/, '')
  const reload = await http.getJson(`${base}/saas/reload?projectRef=${encodeURIComponent(projectRef)}`).catch(() => ({
    status: 0,
    json: {},
    text: '',
  }))
  const persistenceOk = reload.status >= 200 && reload.status < 400 && reload.json.ok === true
  evidence.push(`saas reload HTTP ${reload.status}`)
  return { authOk, workflowOk, persistenceOk, evidence }
}

export function passingEcommerceProbes(): EcommerceProbeResult {
  return {
    catalogHttpOk: true,
    productRendered: true,
    cartOk: true,
    checkoutOk: true,
    orderOk: true,
    orderVisible: true,
    evidence: ['injected passing probes — test double, not live certification'],
  }
}

export function passingSaasProbes(): SaasProbeResult {
  return { authOk: true, workflowOk: true, persistenceOk: true, evidence: ['injected passing probes'] }
}
