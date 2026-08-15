/**
 * Spec-bound Vite + React + TypeScript tree for first BUILD.
 * Not a canned UI kit — brand/vertical/tokens come from BusinessSpec.
 * Platform compiles with vite build and hosts dist/ at /live and *.sites.indobase.in.
 */

import { designSpecFromBusinessSpec, cssVariablesFromTokens } from '../ux/design-system.js'
import { verticalForSpec, type BusinessSpec } from '../ux/business-spec.js'
import { isViteReactProject } from './react-project.js'

function esc(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$')
}

function escJsx(value: string): string {
  return value.replace(/[<>&]/g, '')
}

export function scaffoldViteReactProject(
  spec: BusinessSpec,
  projectRef: string,
): Record<string, string> {
  const design = designSpecFromBusinessSpec(spec)
  const tokens = design.colorPalette
  const brand = escJsx(spec.businessName || 'Business')
  const vertical = escJsx(spec.catalog.verticalId || 'general')
  const industry = escJsx(spec.industry || '')
  const style = escJsx(spec.visualStyle || '')
  const vars = cssVariablesFromTokens(tokens)
  const products = (verticalForSpec(spec)?.products || []).slice(0, 12).map((p) => ({
    id: p.slug,
    name: p.name,
    description: p.description || '',
    priceMinor: Math.round((Number(p.price) || 0) * 100),
    currency: spec.currency || p.currency || 'INR',
    stock: p.stock ?? 10,
    imageUrl: '',
  }))
  const productsJson = JSON.stringify(products)
  const appType = spec.businessType || 'ecommerce'
  const about = escJsx(landingAboutCopy(spec))

  const appBody =
    appType === 'ecommerce'
      ? ecommerceAppTsx({ brand, industry, style, productsJson })
      : appType === 'saas'
        ? saasAppTsx({ brand, industry, projectRef, vars })
        : landingAppTsx({ brand, industry, style, about, projectRef, vars })

  const runtimeModule: Record<string, string> =
    appType === 'ecommerce'
      ? { 'src/commerce.ts': commerceModuleTs() }
      : appType === 'saas'
        ? { 'src/auth.ts': authModuleTs() }
        : { 'src/leads.ts': leadsModuleTs() }

  return {
    ...runtimeModule,
    'package.json': JSON.stringify(
      {
        name: 'indobase-site',
        private: true,
        type: 'module',
        scripts: { build: 'vite build', preview: 'vite preview' },
        dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
        devDependencies: {
          '@types/react': '^19.0.0',
          '@types/react-dom': '^19.0.0',
          '@vitejs/plugin-react': '^4.3.4',
          typescript: '^5.7.2',
          vite: '^6.0.0',
        },
      },
      null,
      2,
    ),
    'index.html': `<!DOCTYPE html>
<html lang="en" data-ib-project="${escJsx(projectRef)}" data-ib-vertical="${vertical}" data-ib-type="${escJsx(appType)}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${brand}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    'vite.config.ts': `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
})
`,
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          lib: ['ES2022', 'DOM', 'DOM.Iterable'],
          module: 'ESNext',
          moduleResolution: 'Bundler',
          jsx: 'react-jsx',
          strict: true,
          skipLibCheck: true,
          noEmit: true,
          isolatedModules: true,
        },
        include: ['src'],
      },
      null,
      2,
    ),
    'src/main.tsx': `import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(<App />)
`,
    'src/App.tsx': appBody,
    'src/styles.css': `${vars}
*{box-sizing:border-box}
body{margin:0;font-family:var(--body);color:var(--ink);background:var(--bg)}
h1,h2{font-family:var(--heading);color:var(--primary);margin:0}
a{color:var(--primary)}
`,
  }
}

/**
 * Typed storefront access to the Indobase Commerce ABI (window.indobase.commerce).
 * The store never talks to PocketBase or a payment gateway, and never prices an
 * order: it sends product ids and quantities, the server returns the amount.
 */
function commerceModuleTs(): string {
  return `export type Variant = {
  id: string
  title: string
  priceMinor: number
  currency: string
  stock: number
  default?: boolean
}

export type Product = {
  id: string
  name: string
  description: string
  priceMinor: number
  currency: string
  stock: number
  imageUrl: string
  variants?: Variant[]
}

export type CartLine = { productId: string; variantId: string; quantity: number }

export type CheckoutInput = {
  items: CartLine[]
  customer: { email: string; name?: string }
}

export type CheckoutResponse = {
  ok: boolean
  orderId?: string
  paymentUrl?: string | null
  message?: string
}

type CommerceAbi = {
  products: { list: () => Promise<Product[]> }
  cart: {
    get: () => CartLine[]
    add: (productId: string, quantity: number, variantId: string) => CartLine[]
    set: (productId: string, quantity: number, variantId: string) => CartLine[]
    remove: (productId: string, variantId: string) => CartLine[]
    clear: () => CartLine[]
  }
  checkout: { create: (input: CheckoutInput) => Promise<CheckoutResponse> }
}

/** Same contract as the ABI, used when the runtime script has not loaded. */
const CHECKOUT_ENDPOINT = '/api/os/commerce/checkout'

export const GENERIC_ERROR = 'We could not place that order just yet. Please try again in a moment.'

type StoreWindow = {
  indobase?: { commerce?: CommerceAbi }
  __INDOBASE_ENV__?: { PROJECT_REF?: string; INDOBASE_COMMERCE_URL?: string }
}

function storeWindow(): StoreWindow {
  return window as unknown as StoreWindow
}

function abi(): CommerceAbi | null {
  return storeWindow().indobase?.commerce ?? null
}

export function defaultVariantId(product: Product): string {
  const preferred = (product.variants || []).find((v) => v.default) || (product.variants || [])[0]
  return preferred ? preferred.id : product.id + '__default'
}

export function unitPriceMinorOf(product: Product, variantId: string): number {
  const variant = (product.variants || []).find((v) => v.id === variantId)
  return variant ? variant.priceMinor : product.priceMinor
}

export function formatMoney(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(minor / 100)
  } catch {
    return currency + ' ' + (minor / 100).toFixed(2)
  }
}

/** In-memory stand-in so the cart still works before the runtime script loads. */
let fallbackCart: CartLine[] = []

export function cartLines(): CartLine[] {
  const commerce = abi()
  return commerce ? commerce.cart.get() : fallbackCart
}

export function addToCart(productId: string, variantId: string, quantity = 1): CartLine[] {
  const commerce = abi()
  if (commerce) return commerce.cart.add(productId, quantity, variantId)
  const existing = fallbackCart.find((l) => l.productId === productId && l.variantId === variantId)
  const next = existing ? existing.quantity + quantity : quantity
  return setCartQuantity(productId, variantId, next)
}

export function setCartQuantity(productId: string, variantId: string, quantity: number): CartLine[] {
  const commerce = abi()
  if (commerce) {
    return quantity > 0
      ? commerce.cart.set(productId, quantity, variantId)
      : commerce.cart.remove(productId, variantId)
  }
  fallbackCart = fallbackCart.filter((l) => !(l.productId === productId && l.variantId === variantId))
  if (quantity > 0) fallbackCart = fallbackCart.concat([{ productId, variantId, quantity }])
  return fallbackCart
}

export function clearCart(): CartLine[] {
  const commerce = abi()
  if (commerce) return commerce.cart.clear()
  fallbackCart = []
  return fallbackCart
}

export async function loadCatalog(): Promise<Product[]> {
  const commerce = abi()
  if (!commerce) return []
  return await commerce.products.list()
}

export async function placeOrder(input: CheckoutInput): Promise<CheckoutResponse> {
  const commerce = abi()
  if (commerce) return await commerce.checkout.create(input)

  const env = storeWindow().__INDOBASE_ENV__
  const base = (env?.INDOBASE_COMMERCE_URL || '').replace(/\\/+$/, '')
  const url = base ? base + '/checkout' : CHECKOUT_ENDPOINT
  const idempotencyKey =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'order_' + Date.now() + '_' + Math.random().toString(16).slice(2)
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({
      projectRef: env?.PROJECT_REF || document.documentElement.dataset.ibProject || '',
      idempotencyKey,
      items: input.items,
      customer: input.customer,
    }),
  })
  const body = (await res.json().catch(() => ({}))) as CheckoutResponse
  if (!res.ok) return { ok: false, message: body.message || GENERIC_ERROR }
  return body
}
`
}

function ecommerceAppTsx(input: {
  brand: string
  industry: string
  style: string
  productsJson: string
}): string {
  return `import { useEffect, useMemo, useState } from 'react'

import {
  addToCart,
  cartLines,
  clearCart,
  defaultVariantId,
  formatMoney,
  GENERIC_ERROR,
  loadCatalog,
  placeOrder,
  setCartQuantity,
  unitPriceMinorOf,
  type CartLine,
  type Product,
} from './commerce'

const SEED_CATALOG: Product[] = ${input.productsJson}

type OrderState =
  | { phase: 'shopping' }
  | { phase: 'placing' }
  | { phase: 'placed'; orderId: string }
  | { phase: 'error'; message: string }

export default function App() {
  const [catalog, setCatalog] = useState<Product[]>(SEED_CATALOG)
  const [lines, setLines] = useState<CartLine[]>([])
  const [email, setEmail] = useState('')
  const [order, setOrder] = useState<OrderState>({ phase: 'shopping' })

  useEffect(() => {
    setLines(cartLines())
    let cancelled = false
    loadCatalog()
      .then((live) => {
        if (!cancelled && live.length > 0) setCatalog(live)
      })
      .catch(() => {
        /* keep the seeded catalog visible instead of an empty store */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const byId = useMemo(() => new Map(catalog.map((p) => [p.id, p])), [catalog])
  const currency = catalog[0]?.currency || 'INR'
  const subtotalMinor = lines.reduce((sum, line) => {
    const product = byId.get(line.productId)
    return product ? sum + unitPriceMinorOf(product, line.variantId) * line.quantity : sum
  }, 0)
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0)

  async function submitOrder() {
    if (lines.length === 0 || !email.trim()) return
    setOrder({ phase: 'placing' })
    try {
      const result = await placeOrder({ items: lines, customer: { email: email.trim() } })
      if (!result.ok) {
        setOrder({ phase: 'error', message: result.message || GENERIC_ERROR })
        return
      }
      if (result.paymentUrl) {
        window.location.href = result.paymentUrl
        return
      }
      setLines(clearCart())
      setOrder({ phase: 'placed', orderId: result.orderId || '' })
    } catch {
      setOrder({ phase: 'error', message: GENERIC_ERROR })
    }
  }

  return (
    <>
      <header data-ib-section="hero" style={{ padding: '28px 22px', borderBottom: '1px solid var(--line)' }}>
        <h1>${esc(input.brand)}</h1>
        <p style={{ margin: '6px 0 0', color: 'var(--muted)' }}>${esc(input.industry)} · ${esc(input.style)}</p>
      </header>

      <main data-ib-section="products" style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 18px 72px' }}>
        <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 16 }}>
          {catalog.map((product) => (
            <article
              key={product.id}
              className="card"
              style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 14 }}
            >
              <h2 style={{ fontSize: '1rem' }}>{product.name}</h2>
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>{product.description}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <span>{formatMoney(product.priceMinor, product.currency)}</span>
                <button
                  type="button"
                  className="add"
                  disabled={product.stock === 0}
                  onClick={() => {
                    setLines(addToCart(product.id, defaultVariantId(product)))
                    setOrder({ phase: 'shopping' })
                  }}
                  style={{ border: 0, background: 'var(--primary)', color: '#fff', padding: '8px 12px', borderRadius: 'var(--radius)', cursor: 'pointer' }}
                >
                  {product.stock === 0 ? 'Sold out' : 'Add to cart'}
                </button>
              </div>
            </article>
          ))}
        </div>

        <section
          data-ib-section="cart"
          style={{ marginTop: 40, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 18 }}
        >
          <h2 style={{ fontSize: '1.05rem' }}>Your cart{itemCount > 0 ? ' (' + itemCount + ')' : ''}</h2>

          {lines.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>Your cart is empty.</p>
          ) : (
            <>
              <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
                {lines.map((line) => {
                  const product = byId.get(line.productId)
                  return (
                    <li
                      key={line.productId + line.variantId}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderTop: '1px solid var(--line)' }}
                    >
                      <span>{product ? product.name : line.productId}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          type="button"
                          aria-label="Remove one"
                          onClick={() => setLines(setCartQuantity(line.productId, line.variantId, line.quantity - 1))}
                          style={{ cursor: 'pointer' }}
                        >
                          −
                        </button>
                        <span>{line.quantity}</span>
                        <button
                          type="button"
                          aria-label="Add one"
                          onClick={() => setLines(setCartQuantity(line.productId, line.variantId, line.quantity + 1))}
                          style={{ cursor: 'pointer' }}
                        >
                          +
                        </button>
                      </span>
                    </li>
                  )
                })}
              </ul>

              <p style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Subtotal</span>
                <strong>{formatMoney(subtotalMinor, currency)}</strong>
              </p>
              <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 0 }}>
                Taxes, delivery and the final amount are confirmed when the order is placed.
              </p>

              <label htmlFor="email" style={{ display: 'block', marginTop: 16, fontSize: 13, color: 'var(--muted)' }}>
                Email for order updates
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                style={{ width: '100%', marginTop: 6, padding: 10, borderRadius: 'var(--radius)', border: '1px solid var(--line)' }}
              />
              <button
                type="button"
                disabled={order.phase === 'placing' || !email.trim()}
                onClick={submitOrder}
                style={{ marginTop: 12, border: 0, background: 'var(--primary)', color: '#fff', padding: '10px 16px', borderRadius: 'var(--radius)', cursor: 'pointer' }}
              >
                {order.phase === 'placing' ? 'Placing order…' : 'Place order'}
              </button>
            </>
          )}

          {order.phase === 'placed' ? (
            <p role="status" style={{ marginTop: 14 }}>
              Order placed. {order.orderId ? 'Your reference is ' + order.orderId + '.' : ''} We have emailed the details.
            </p>
          ) : null}
          {order.phase === 'error' ? (
            <p role="alert" style={{ marginTop: 14, color: 'var(--primary)' }}>
              {order.message}
            </p>
          ) : null}
        </section>
      </main>
    </>
  )
}
`
}

/**
 * Typed sign-in against the Indobase auth ABI (window.indobase.auth), which the
 * platform binds to the tenant records base at publish time.
 */
function authModuleTs(): string {
  return `export type Session = { email: string; token: string }

type AuthAbi = {
  startOtp: (email: string) => Promise<Response>
  verify: (email: string, code: string) => Promise<Response>
}

const SESSION_KEY = 'indobase.saas.session'

export const GENERIC_ERROR = 'We could not sign you in just yet. Please try again in a moment.'

function abi(): AuthAbi | null {
  return (window as unknown as { indobase?: { auth?: AuthAbi } }).indobase?.auth ?? null
}

export function currentSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Session>
    return parsed.email && parsed.token ? { email: parsed.email, token: parsed.token } : null
  } catch {
    return null
  }
}

export function signOut(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* a blocked storage write should not trap the user in a signed-in shell */
  }
}

export async function requestCode(email: string): Promise<{ ok: boolean; message?: string }> {
  const auth = abi()
  if (!auth) return { ok: false, message: GENERIC_ERROR }
  try {
    const res = await auth.startOtp(email)
    return res.ok ? { ok: true } : { ok: false, message: GENERIC_ERROR }
  } catch {
    return { ok: false, message: GENERIC_ERROR }
  }
}

export async function verifyCode(
  email: string,
  code: string,
): Promise<{ ok: boolean; session?: Session; message?: string }> {
  const auth = abi()
  if (!auth) return { ok: false, message: GENERIC_ERROR }
  try {
    const res = await auth.verify(email, code)
    const body = (await res.json().catch(() => ({}))) as { token?: string }
    if (!res.ok || !body.token) return { ok: false, message: GENERIC_ERROR }
    const session: Session = { email, token: body.token }
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } catch {
      /* keep the user signed in for this page even if storage is unavailable */
    }
    return { ok: true, session }
  } catch {
    return { ok: false, message: GENERIC_ERROR }
  }
}
`
}

function saasAppTsx(input: { brand: string; industry: string; projectRef: string; vars: string }): string {
  return `import { useState } from 'react'

import {
  currentSession,
  GENERIC_ERROR,
  requestCode,
  signOut,
  verifyCode,
  type Session,
} from './auth'

type Step = 'email' | 'code' | 'sending' | 'verifying'

const fieldStyle = {
  width: '100%',
  marginTop: 6,
  padding: 10,
  borderRadius: 'var(--radius)',
  border: '1px solid var(--line)',
}

const buttonStyle = {
  marginTop: 12,
  border: 0,
  background: 'var(--primary)',
  color: '#fff',
  padding: '10px 16px',
  borderRadius: 'var(--radius)',
  cursor: 'pointer',
}

export default function App() {
  const [session, setSession] = useState<Session | null>(currentSession())
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  async function sendCode() {
    if (!email.trim()) return
    setStep('sending')
    setError('')
    const result = await requestCode(email.trim())
    if (!result.ok) {
      setError(result.message || GENERIC_ERROR)
      setStep('email')
      return
    }
    setStep('code')
  }

  async function confirmCode() {
    if (!code.trim()) return
    setStep('verifying')
    setError('')
    const result = await verifyCode(email.trim(), code.trim())
    if (!result.ok || !result.session) {
      setError(result.message || GENERIC_ERROR)
      setStep('code')
      return
    }
    setSession(result.session)
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px' }}>
      <header data-ib-section="hero">
        <h1>${esc(input.brand)}</h1>
        <p style={{ color: 'var(--muted)' }}>${esc(input.industry)} · Sign in to continue</p>
      </header>

      {session ? (
        <section style={{ marginTop: 32 }}>
          <p>Signed in as {session.email}. Your workspace is ready.</p>
          <button
            type="button"
            onClick={() => {
              signOut()
              setSession(null)
              setStep('email')
              setCode('')
            }}
            style={buttonStyle}
          >
            Sign out
          </button>
        </section>
      ) : (
        <section style={{ marginTop: 32 }}>
          <label htmlFor="email" style={{ display: 'block', fontSize: 13, color: 'var(--muted)' }}>
            Work email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            disabled={step === 'code' || step === 'verifying'}
            style={fieldStyle}
          />

          {step === 'code' || step === 'verifying' ? (
            <>
              <label htmlFor="code" style={{ display: 'block', marginTop: 16, fontSize: 13, color: 'var(--muted)' }}>
                Six-digit code we emailed you
              </label>
              <input
                id="code"
                inputMode="numeric"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="123456"
                style={fieldStyle}
              />
              <button type="button" onClick={confirmCode} disabled={step === 'verifying'} style={buttonStyle}>
                {step === 'verifying' ? 'Checking…' : 'Sign in'}
              </button>
            </>
          ) : (
            <button type="button" onClick={sendCode} disabled={step === 'sending'} style={buttonStyle}>
              {step === 'sending' ? 'Sending…' : 'Send sign-in code'}
            </button>
          )}

          {error ? (
            <p role="alert" style={{ marginTop: 14, color: 'var(--primary)' }}>
              {error}
            </p>
          ) : null}
        </section>
      )}
    </main>
  )
}
`
}

/** Spec-derived body copy — no invented contact details or fabricated claims. */
function leadsModuleTs(): string {
  return `export type Enquiry = {
  name: string
  email: string
  phone: string
  message: string
}

export type EnquiryResult = { ok: boolean; message: string }

type LeadsAbi = { submit: (enquiry: Enquiry) => Promise<EnquiryResult> }

type LeadsWindow = Window & {
  indobase?: { leads?: LeadsAbi }
  __INDOBASE_ENV__?: { PROJECT_REF?: string; INDOBASE_LEADS_URL?: string }
}

const LEADS_ENDPOINT = '/api/os/leads'

export const GENERIC_ERROR = 'We could not send that just now. Please try again in a moment.'
export const SENT_MESSAGE = 'Thanks — your enquiry is with us. We will reply shortly.'

function leadsWindow(): LeadsWindow {
  return window as unknown as LeadsWindow
}

/** Mirrors the server rules so the visitor is corrected before a round trip. */
export function validateEnquiry(enquiry: Enquiry): string | null {
  if (enquiry.name.trim().length < 2) return 'Please add your name.'
  if (!enquiry.email.trim() && !enquiry.phone.trim()) {
    return 'Add an email or phone number so we can reply.'
  }
  if (enquiry.email.trim() && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(enquiry.email.trim())) {
    return 'That email address looks incomplete.'
  }
  return null
}

export async function sendEnquiry(enquiry: Enquiry): Promise<EnquiryResult> {
  const abi = leadsWindow().indobase?.leads
  if (abi) return await abi.submit(enquiry)

  const env = leadsWindow().__INDOBASE_ENV__
  const base = (env?.INDOBASE_LEADS_URL || '').replace(/\\/+$/, '')
  const res = await fetch(base || LEADS_ENDPOINT, {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...enquiry,
      source: 'website',
      projectRef: env?.PROJECT_REF || document.documentElement.dataset.ibProject || '',
    }),
  })
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string }
  if (!res.ok) return { ok: false, message: body.message || GENERIC_ERROR }
  return { ok: true, message: body.message || SENT_MESSAGE }
}
`
}

function landingAboutCopy(spec: BusinessSpec): string {
  const name = spec.businessName || 'This business'
  const industry = (spec.industry || '').trim()
  const audience = (spec.targetCustomer || '').trim()
  const parts = [industry ? `${name} works in ${industry}.` : `${name}.`]
  if (audience) parts.push(`We build for ${audience}.`)
  return parts.join(' ')
}

function landingAppTsx(input: {
  brand: string
  industry: string
  style: string
  about: string
  projectRef: string
  vars: string
}): string {
  return `import { useState } from 'react'

import { sendEnquiry, validateEnquiry, GENERIC_ERROR, type Enquiry } from './leads'

const EMPTY: Enquiry = { name: '', email: '', phone: '', message: '' }

const fieldStyle = {
  width: '100%',
  padding: '11px 12px',
  marginTop: 6,
  border: '1px solid rgba(0,0,0,.16)',
  borderRadius: 'var(--radius)',
  font: 'inherit',
  boxSizing: 'border-box' as const,
}

export default function App() {
  const [enquiry, setEnquiry] = useState<Enquiry>(EMPTY)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState('')
  const [error, setError] = useState('')

  function update(field: keyof Enquiry, value: string) {
    setEnquiry((current) => ({ ...current, [field]: value }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const invalid = validateEnquiry(enquiry)
    if (invalid) {
      setError(invalid)
      return
    }
    setError('')
    setSending(true)
    try {
      const result = await sendEnquiry(enquiry)
      if (result.ok) {
        setSent(result.message)
        setEnquiry(EMPTY)
      } else {
        setError(result.message)
      }
    } catch {
      setError(GENERIC_ERROR)
    } finally {
      setSending(false)
    }
  }

  return (
    <main>
      <header data-ib-section="hero" style={{ padding: '64px 24px', textAlign: 'center' }}>
        <h1>${esc(input.brand)}</h1>
        <p style={{ color: 'var(--muted)', marginTop: 12 }}>${esc(input.industry)} · ${esc(input.style)}</p>
        <a href="#enquiry" style={{ display: 'inline-block', marginTop: 24, padding: '12px 20px', background: 'var(--primary)', color: '#fff', borderRadius: 'var(--radius)', textDecoration: 'none' }}>
          Get in touch
        </a>
      </header>

      <section id="about" style={{ maxWidth: 640, margin: '0 auto', padding: '48px 24px', textAlign: 'center' }}>
        <h2>What we do</h2>
        <p style={{ color: 'var(--muted)' }}>${esc(input.about)}</p>
      </section>

      <section id="enquiry" data-ib-section="enquiry" style={{ maxWidth: 520, margin: '0 auto', padding: '8px 24px 56px' }}>
        <h2>Send an enquiry</h2>
        {sent ? (
          <p role="status" style={{ color: 'var(--muted)' }}>
            {sent}
          </p>
        ) : (
          <form onSubmit={submit} noValidate>
            <label style={{ display: 'block', marginTop: 14 }}>
              Name
              <input
                value={enquiry.name}
                onChange={(e) => update('name', e.target.value)}
                autoComplete="name"
                style={fieldStyle}
              />
            </label>
            <label style={{ display: 'block', marginTop: 14 }}>
              Email
              <input
                type="email"
                value={enquiry.email}
                onChange={(e) => update('email', e.target.value)}
                autoComplete="email"
                style={fieldStyle}
              />
            </label>
            <label style={{ display: 'block', marginTop: 14 }}>
              Phone
              <input
                value={enquiry.phone}
                onChange={(e) => update('phone', e.target.value)}
                autoComplete="tel"
                style={fieldStyle}
              />
            </label>
            <label style={{ display: 'block', marginTop: 14 }}>
              How can we help?
              <textarea
                value={enquiry.message}
                onChange={(e) => update('message', e.target.value)}
                rows={4}
                style={fieldStyle}
              />
            </label>
            <button
              type="submit"
              disabled={sending}
              style={{ marginTop: 18, padding: '12px 20px', background: 'var(--primary)', color: '#fff', border: 0, borderRadius: 'var(--radius)', font: 'inherit', cursor: 'pointer' }}
            >
              {sending ? 'Sending…' : 'Send enquiry'}
            </button>
            {error ? (
              <p role="alert" style={{ marginTop: 14, color: 'var(--primary)' }}>
                {error}
              </p>
            ) : null}
          </form>
        )}
      </section>

      <footer style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
        © {new Date().getFullYear()} ${esc(input.brand)}
      </footer>
    </main>
  )
}
`
}

/** Prefer an existing Vite tree; otherwise scaffold from the business spec. */
export function resolveViteProjectFiles(
  files: Record<string, string> | null | undefined,
  spec: BusinessSpec,
  projectRef: string,
): { files: Record<string, string>; scaffolded: boolean } {
  if (isViteReactProject(files)) {
    return { files: { ...(files || {}) }, scaffolded: false }
  }
  return { files: scaffoldViteReactProject(spec, projectRef), scaffolded: true }
}
