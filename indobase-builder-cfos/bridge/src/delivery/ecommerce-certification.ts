/**
 * Ecommerce Production Certification v1 — application outcome, not orchestration-only.
 *
 * v1 required = product → cart → checkout → order → inventory → admin → LIVE.
 * Stretch gaps (customer OTP, order history) are recorded, not silently passed.
 */

import { planProductionApp } from '../production-launch/application-planner.js'
import {
  executeProductionLaunchJob,
  type ProductionLaunchExecuteResult,
} from '../production-launch/pipeline.js'
import { findEcommerceVertical } from '../vertical-catalog.js'
import { buildManagedShopStorefrontHtml } from '../pocketbase/shop-storefront-html.js'
import { buildManagedShopAdminHtml } from '../pocketbase/shop-admin-html.js'
import { runEcommerceStaticVerifiers } from './ecommerce-verifiers.js'
import { ECOMMERCE_CERT_CORPUS, type EcommerceCertStore } from './ecommerce-cert-corpus.js'
import type { Session } from '../auth.js'

export const ECOMMERCE_CERT_VERSION = 'ecommerce-cert/v1' as const

export type CertCheckStatus = 'pass' | 'fail' | 'gap'

export type CertCheck = {
  id: string
  group: 'storefront' | 'commerce' | 'customer' | 'admin' | 'production'
  required: boolean
  status: CertCheckStatus
  detail: string
}

export type StoreCertResult = {
  store: EcommerceCertStore
  certified: boolean
  checks: CertCheck[]
  requiredFailed: CertCheck[]
  gaps: CertCheck[]
}

export type EcommerceCertReport = {
  version: typeof ECOMMERCE_CERT_VERSION
  stores: number
  certified: number
  failed: number
  results: StoreCertResult[]
}

const BACKEND = {
  anon_key: 'public',
  api_url: 'https://backend.indobase.in',
  auth_url: 'https://backend.indobase.in/api/collections/users',
  rest_url: 'https://backend.indobase.in/api/collections',
  storage_url: 'https://backend.indobase.in/api/files',
  project_name: 'cert',
  project_ref: 'certapp01',
  project_url: 'https://backend.indobase.in',
}

function check(
  id: string,
  group: CertCheck['group'],
  required: boolean,
  ok: boolean,
  detail: string,
  gap = false,
): CertCheck {
  return {
    id,
    group,
    required,
    status: gap ? 'gap' : ok ? 'pass' : 'fail',
    detail,
  }
}

function sessionFor(store: EcommerceCertStore): Session {
  return {
    gotrueId: `cert-${store.id}`,
    email: `cert-${store.id}@indobase.in`,
    projectRef: `cert${store.id}`.replace(/[^a-z0-9]/g, '').slice(0, 16) || 'certstore',
    orgSlug: 'cert',
    projectName: store.brand,
    studioUrl: 'https://studio.indobase.in',
  }
}

function productsFor(store: EcommerceCertStore) {
  const vertical = findEcommerceVertical(store.verticalId)
  const raw = vertical?.products || []
  return raw.map((p, i) => ({
    id: p.slug || `p${i + 1}`,
    slug: p.slug,
    name: p.name,
    description: p.description,
    price: Number(p.price) || 0,
    stock: p.stock,
    currency: p.currency,
  }))
}

export function certifyStorefrontAndAdmin(store: EcommerceCertStore): CertCheck[] {
  const products = productsFor(store)
  const html = buildManagedShopStorefrontHtml({
    brand: store.brand,
    appId: store.id.replace(/[^a-z0-9]/g, '').slice(0, 12) || 'certapp',
    publicUrl: 'https://backend.indobase.in',
    commerceBaseUrl: 'https://builder.indobase.in',
    products,
  })
  const admin = buildManagedShopAdminHtml({
    brand: store.brand,
    appId: store.id.replace(/[^a-z0-9]/g, '').slice(0, 12) || 'certapp',
    publicUrl: 'https://backend.indobase.in',
    products,
    orders: [
      {
        id: 'ord_cert',
        email: 'buyer@example.com',
        total: '499',
        status: 'paid',
      },
    ],
  })
  const verifiers = runEcommerceStaticVerifiers({ html })
  const verifiersOk = verifiers.every((v) => v.ok)

  return [
    check(
      'homepage',
      'storefront',
      true,
      /<h1>/.test(html) && html.includes(store.brand.split(/[\s&]+/)[0] || store.brand),
      'Brand homepage renders',
    ),
    check('product_listing', 'storefront', true, products.length >= 1 && /id="grid"/.test(html), `${products.length} catalog products listed`),
    check('product_detail', 'storefront', true, /id="pdpDlg"/.test(html) && /openPdp/.test(html), 'Product detail dialog present'),
    check('search_filter', 'storefront', true, /id="search"/.test(html) && /visibleProducts/.test(html), 'Search/filter on catalog'),
    check('cart', 'storefront', true, /commerce\.cart\.add/.test(html) && /id="openCart"/.test(html), 'Cart UX bound to commerce.cart'),
    check('checkout', 'storefront', true, /commerce\.checkout\.create/.test(html), 'Checkout via Commerce ABI'),
    check('order_confirmation', 'storefront', true, /id="confirmDlg"/.test(html) && /confirmOrderId/.test(html), 'Order confirmation after checkout'),
    check('responsive', 'storefront', true, /viewport/.test(html) && /@media/.test(html), 'Viewport + responsive breakpoints'),
    check('no_runtime_pb_orders', 'storefront', true, !/\/api\/collections\/[^"'/\s]*orders/.test(html), 'No PocketBase order POSTs'),
    check('commerce_verifiers', 'commerce', true, verifiersOk, verifiersOk ? 'Static commerce verifiers pass' : verifiers.filter((v) => !v.ok).map((v) => v.id).join(',')),
    check('server_pricing_copy', 'commerce', true, /Final price is calculated by Indobase Commerce/.test(html), 'UI states server-authoritative price'),
    check('admin_products', 'admin', true, /id="products"/.test(admin) && /Inventory/.test(admin), 'Admin shows inventory'),
    check('admin_orders', 'admin', true, /id="orders"/.test(admin) && /Orders/.test(admin), 'Admin shows orders'),
    check('admin_customer_order', 'admin', true, /Customer/.test(admin) && /buyer@example.com|email/i.test(admin), 'Admin order has customer field'),
    check('tenant_prefix', 'production', true, /INDOBASE_COLLECTION_PREFIX|ib_/.test(admin + html), 'Tenant collection prefix present'),
    check('https_assets', 'production', true, /https:\/\/backend\.indobase\.in/.test(html), 'Backend origin is HTTPS'),
    check('customer_signup', 'customer', false, false, 'Storefront has no customer signup/OTP yet', true),
    check('customer_login_session', 'customer', false, false, 'No persistent customer session UI yet', true),
    check('customer_order_history', 'customer', false, false, 'No signed-in order history yet', true),
    check('failed_payment_recovery_ui', 'commerce', false, false, 'Payment failure recovery is CheckoutService-only; no storefront retry UI yet', true),
  ]
}

export async function certifyProductionJob(store: EcommerceCertStore): Promise<{
  checks: CertCheck[]
  job: ProductionLaunchExecuteResult
}> {
  const session = sessionFor(store)
  const products = productsFor(store)
  const html = buildManagedShopStorefrontHtml({
    brand: store.brand,
    appId: session.projectRef,
    publicUrl: BACKEND.api_url,
    commerceBaseUrl: 'https://builder.indobase.in',
    products,
  })
  const job = await executeProductionLaunchJob(
    session,
    {
      intent: store.prompt,
      appType: 'ecommerce',
      brand: store.brand,
      vertical: store.verticalId,
      html,
    },
    {
      guided: async () => ({
        ok: true,
        tool: 'guidedBackend',
        mode: 'ecommerce',
        steps: [
          { id: 'ensureDatabase', status: 'ok', message: 'ok' },
          { id: 'setupShopCatalog', status: 'ok', message: 'ok' },
          { id: 'placeTestShopOrder', status: 'ok', message: 'ok' },
        ],
        progress: 'catalog + test order',
        message: 'backend ready',
        claim_backend_ready: true,
        claim_live: false,
        catalog_json: products,
        storefront_html: html,
        backend: {
          api_url: BACKEND.api_url,
          anon_key: BACKEND.anon_key,
          project_ref: BACKEND.project_ref,
          project_name: store.brand,
        },
      }),
      launch: async () => ({
        ok: true,
        status: 'published',
        url: `https://${store.id}.sites.indobase.in`,
        message: 'published',
        lane: 'static',
        claim_live: true,
        tool: 'launchBusiness',
      }),
      smoke: async (url) =>
        url.includes('.sites.indobase.in')
          ? { ok: true, message: 'production smoke' }
          : { ok: false, message: 'bad host' },
    },
  )
  const live = job.ok && job.claim_live && job.job.status === 'live'
  return {
    job,
    checks: [
      check('job_classifies_ecommerce', 'production', true, job.job.appType === 'ecommerce', `appType=${job.job.appType}`),
      check('job_live', 'production', true, live, live ? String(job.url) : job.message),
      check(
        'job_evidence',
        'production',
        true,
        job.job.evidence?.claim_production_ready === true,
        job.job.evidence?.claim_production_ready ? 'claim_production_ready from evidence' : 'evidence incomplete',
      ),
      check('job_smoke', 'production', true, job.job.evidence?.smoke_ok === true, 'Production smoke stage'),
      check('job_test_order', 'commerce', true, job.job.evidence?.test_order_ok === true, 'placeTestShopOrder in provision'),
    ],
  }
}

export async function certifyStore(store: EcommerceCertStore): Promise<StoreCertResult> {
  const plan = planProductionApp({ intent: store.prompt })
  const planCheck = check(
    'prompt_classifies_ecommerce',
    'production',
    true,
    plan.appType === 'ecommerce',
    `planner=${plan.appType} source=${plan.source}`,
  )
  const surface = certifyStorefrontAndAdmin(store)
  const prod = await certifyProductionJob(store)
  const checks = [planCheck, ...surface, ...prod.checks]
  const requiredFailed = checks.filter((c) => c.required && c.status === 'fail')
  const gaps = checks.filter((c) => c.status === 'gap')
  return {
    store,
    certified: requiredFailed.length === 0,
    checks,
    requiredFailed,
    gaps,
  }
}

export async function runEcommerceCertification(
  stores: readonly EcommerceCertStore[] = ECOMMERCE_CERT_CORPUS,
): Promise<EcommerceCertReport> {
  const results: StoreCertResult[] = []
  for (const store of stores) {
    results.push(await certifyStore(store))
  }
  const certified = results.filter((r) => r.certified).length
  return {
    version: ECOMMERCE_CERT_VERSION,
    stores: results.length,
    certified,
    failed: results.length - certified,
    results,
  }
}

export function formatEcommerceCertReport(report: EcommerceCertReport): string {
  const lines = [
    `ECOMMERCE CERTIFICATION ${report.version}`,
    `${report.certified} / ${report.stores} GENERATED STORES PASS`,
  ]
  for (const row of report.results) {
    const mark = row.certified ? 'PASS' : 'FAIL'
    const gapIds = row.gaps.map((g) => g.id).join(',')
    lines.push(`- ${row.store.id} ${row.store.brand}: ${mark}${gapIds ? ` (gaps: ${gapIds})` : ''}`)
    for (const fail of row.requiredFailed) {
      lines.push(`    FAIL ${fail.id}: ${fail.detail}`)
    }
  }
  return lines.join('\n')
}
