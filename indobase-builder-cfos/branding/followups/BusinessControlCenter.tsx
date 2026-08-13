/**
 * Post-launch Business Control Center — visual UI + persistent AI.
 * Nav comes from the application contract/capabilities, not a hardcoded Shopify clone.
 */
import { useEffect, useMemo, useState } from 'react'

import styles from './BusinessControlCenter.module.css'
import {
  type ControlCenterSection,
  type ProjectCapability,
  type WorkspaceScreen,
  formatScreenMessage,
} from './ux-conductor'

type Snapshot = {
  products?: Array<{ id?: string; name?: string; priceMinor?: number; currency?: string }>
  orders?: Array<{
    id?: string
    orderNumber?: string
    amountMinor?: number
    currency?: string
    status?: string
    payment_status?: string
  }>
}

function money(minor?: number, currency = 'INR'): string {
  if (typeof minor !== 'number' || Number.isNaN(minor)) return '—'
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(minor / 100)
  } catch {
    return `${Math.round(minor / 100)} ${currency}`
  }
}

function greeting(name?: string | null): string {
  const hour = new Date().getHours()
  const when = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const who = name?.trim()
  return who ? `${when}, ${who.split(/\s+/)[0]}` : when
}

export function BusinessControlCenter({
  brand,
  displayName,
  liveUrl,
  nav,
  capabilities,
  projectRef,
  disabled,
  onPick,
  onOpenStorefront,
  onScreen,
}: {
  brand: string
  displayName?: string | null
  liveUrl?: string | null
  nav: ControlCenterSection[]
  capabilities: ProjectCapability[]
  projectRef?: string | null
  disabled?: boolean
  onPick: (message: string) => void
  onOpenStorefront: () => void
  onScreen: (screen: WorkspaceScreen) => void
}) {
  const [section, setSection] = useState(nav[0]?.id || 'overview')
  const [entityId, setEntityId] = useState<string | null>(null)
  const [ask, setAsk] = useState('')
  const [snap, setSnap] = useState<Snapshot>({})
  const current = nav.find((n) => n.id === section) || nav[0]
  const screen = useMemo<WorkspaceScreen>(
    () => ({ section, entityId, label: current?.label || section }),
    [section, entityId, current?.label],
  )

  useEffect(() => {
    onScreen(screen)
  }, [onScreen, screen])

  useEffect(() => {
    if (!projectRef || !capabilities.includes('commerce')) return
    let cancelled = false
    void fetch('/api/os/commerce/admin/snapshot', {
      credentials: 'same-origin',
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.ok) setSnap({ products: data.products || [], orders: data.orders || [] })
      })
      .catch(() => {
        /* visual UI still renders */
      })
    return () => {
      cancelled = true
    }
  }, [capabilities, projectRef])

  const send = (request: string) => {
    const text = request.trim()
    if (!text) return
    onPick(formatScreenMessage(screen, text))
  }

  return (
    <div className={styles.root}>
      <nav className={styles.nav} aria-label="Business">
        {nav.map((item) => (
          <button
            key={item.id}
            type="button"
            className={styles.navBtn}
            data-active={item.id === section ? 'true' : 'false'}
            onClick={() => {
              setSection(item.id)
              setEntityId(null)
              if (item.id === 'storefront' || item.id === 'website' || item.id === 'application') {
                onOpenStorefront()
              }
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <section className={styles.main}>
        <h2 className={styles.hello}>{greeting(displayName)}</h2>
        <p className={styles.muted}>
          {brand}
          {liveUrl ? ` · ${hostOf(liveUrl)}` : ''}
        </p>
        {section === 'overview' ? (
          <>
            <div className={styles.metrics}>
              <div className={styles.metric}>
                <b>{snap.orders?.length ?? '—'}</b>
                <span>Orders</span>
              </div>
              <div className={styles.metric}>
                <b>{snap.products?.length ?? '—'}</b>
                <span>Products</span>
              </div>
              <div className={styles.metric}>
                <b>
                  {money(
                    (snap.orders || []).reduce((n, o) => n + Number(o.amountMinor || 0), 0),
                    snap.orders?.[0]?.currency,
                  )}
                </b>
                <span>Sales</span>
              </div>
            </div>
            <ul className={styles.list}>
              {(snap.orders || []).slice(0, 6).map((o) => (
                <li key={o.id || o.orderNumber}>
                  <button
                    type="button"
                    className={styles.row}
                    onClick={() => {
                      setSection('orders')
                      setEntityId(String(o.orderNumber || o.id || ''))
                    }}
                  >
                    <span>#{o.orderNumber || o.id}</span>
                    <span>{money(o.amountMinor, o.currency)}</span>
                    <span>{o.payment_status || o.status || ''}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className={styles.actions}>
              <button type="button" onClick={() => send('Show me today’s orders.')}>
                Show today’s orders
              </button>
              <button type="button" data-secondary="" onClick={onOpenStorefront}>
                Edit storefront
              </button>
            </div>
          </>
        ) : null}
        {section === 'products' ? (
          <>
            <ul className={styles.list}>
              {(snap.products || []).slice(0, 20).map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={styles.row}
                    data-active={entityId === p.id ? 'true' : 'false'}
                    onClick={() => setEntityId(p.id || null)}
                  >
                    <span>{p.name || p.id}</span>
                    <span>{money(p.priceMinor, p.currency)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className={styles.actions}>
              <button type="button" onClick={() => send('Add 10 summer products.')}>
                Add products
              </button>
            </div>
          </>
        ) : null}
        {section === 'orders' ? (
          <>
            <ul className={styles.list}>
              {(snap.orders || []).slice(0, 20).map((o) => {
                const id = String(o.orderNumber || o.id || '')
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className={styles.row}
                      data-active={entityId === id ? 'true' : 'false'}
                      onClick={() => setEntityId(id)}
                    >
                      <span>#{id}</span>
                      <span>{money(o.amountMinor, o.currency)}</span>
                      <span>{o.payment_status || o.status || ''}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <div className={styles.actions}>
              <button type="button" onClick={() => send('Show me today’s orders.')}>
                Find an order
              </button>
              {entityId ? (
                <button type="button" data-secondary="" onClick={() => send(`Mark #${entityId} as shipped.`)}>
                  Mark shipped
                </button>
              ) : null}
            </div>
          </>
        ) : null}
        {section === 'payments' ? (
          <div className={styles.actions}>
            <button
              type="button"
              onClick={() => send('Connect payments so customers can pay online.')}
            >
              Connect payments
            </button>
          </div>
        ) : null}
        {section === 'settings' || section === 'customers' || section === 'users' || section === 'data' ? (
          <div className={styles.actions}>
            <button type="button" onClick={() => send(`Help me with ${current?.label || section}.`)}>
              Open {current?.label || section}
            </button>
            {liveUrl ? (
              <a href={liveUrl} target="_blank" rel="noreferrer">
                <button type="button" data-secondary="">
                  Open live site
                </button>
              </a>
            ) : null}
          </div>
        ) : null}
      </section>
      <form
        className={styles.ask}
        onSubmit={(e) => {
          e.preventDefault()
          send(ask)
          setAsk('')
        }}
      >
        <input
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          placeholder='Ask AI anything about your business…'
          disabled={disabled}
          aria-label="Ask AI"
        />
        <button type="submit" disabled={disabled || !ask.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url.replace(/^https?:\/\//, '')
  }
}
