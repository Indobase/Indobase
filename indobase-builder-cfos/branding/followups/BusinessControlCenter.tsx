/**
 * Persistent Control Center — derived from BusinessRuntimeState via presentation.
 * Ecommerce vs SaaS vs landing show only relevant capabilities.
 */
import { useEffect, useMemo, useRef, useState } from 'react'

import styles from './BusinessControlCenter.module.css'
import {
  composePresentation,
  pickOperatorMessage,
  readWorkspaceScreenFromSearch,
  type PresentationSurface,
  type RuntimeView,
} from './presentation'
import {
  type ControlCenterSection,
  type ProjectCapability,
  type WorkspaceScreen,
  formatScreenMessage,
} from './ux-conductor'

function greeting(name?: string | null): string {
  const hour = new Date().getHours()
  const when = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const who = name?.trim()
  return who ? `${when}, ${who.split(/\s+/)[0]}` : when
}

function readRuntime(): RuntimeView | null {
  try {
    const runtime = (window as unknown as { __INDOBASE_RUNTIME__?: RuntimeView }).__INDOBASE_RUNTIME__
    return runtime?.business ? runtime : null
  } catch {
    return null
  }
}

function readUx(): PresentationSurface | null {
  try {
    const ux = (window as unknown as { __INDOBASE_UX__?: PresentationSurface }).__INDOBASE_UX__
    return ux?.lifecycle ? ux : null
  } catch {
    return null
  }
}

export function BusinessControlCenter({
  brand,
  displayName,
  liveUrl,
  nav,
  capabilities: _capabilities,
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
  const [section, setSection] = useState(() => sectionFromUrl(nav))
  const [entityId, setEntityId] = useState<string | null>(null)
  const [ask, setAsk] = useState('')
  const [tick, setTick] = useState(0)
  const [leadBusy, setLeadBusy] = useState<string | null>(null)
  const [leadOverrides, setLeadOverrides] = useState<Record<string, 'new' | 'handled'>>({})
  const deepLinkApplied = useRef(false)
  const current = nav.find((n) => n.id === section) || nav[0]
  const screen = useMemo<WorkspaceScreen>(
    () => ({ section, entityId, label: current?.label || section }),
    [section, entityId, current?.label],
  )

  useEffect(() => {
    onScreen(screen)
  }, [onScreen, screen])

  useEffect(() => {
    const refresh = () => {
      setTick((n) => n + 1)
      setLeadOverrides({})
    }
    window.addEventListener('indobase:context', refresh)
    window.addEventListener('indobase:runtime-updated', refresh)
    return () => {
      window.removeEventListener('indobase:context', refresh)
      window.removeEventListener('indobase:runtime-updated', refresh)
    }
  }, [])

  const surface = useMemo(() => {
    void tick
    const fromWindow = readUx()
    if (fromWindow) return fromWindow
    const runtime = readRuntime()
    if (runtime) return composePresentation(runtime)
    return null
  }, [tick])

  const home = surface?.home
  const rail = surface?.lifecycle
  const visibleNav = surface?.control.nav?.length ? surface.control.nav : nav
  const kind = home?.kind
  const store = kind === 'store' || kind === 'ecommerce' || kind === 'ordering'
  const leads = (home?.leads || []).map((lead) => ({
    ...lead,
    status: leadOverrides[lead.id] || lead.status,
  }))
  const openLeadCount = leads.filter((lead) => lead.status === 'new').length
  const openOrderCount = (home?.orders || []).filter((o) =>
    /pending|unpaid|reserved/i.test(o.status || ''),
  ).length

  useEffect(() => {
    if (deepLinkApplied.current) return
    const items = visibleNav.length ? visibleNav : nav
    const wanted = readWorkspaceScreenFromSearch(window.location.search)
    if (!wanted) {
      deepLinkApplied.current = true
      return
    }
    if (!items.some((item) => item.id === wanted)) return
    setSection(wanted)
    deepLinkApplied.current = true
  }, [visibleNav, nav])

  const send = (request: string) => {
    const text = request.trim()
    if (!text) return
    onPick(formatScreenMessage(screen, text))
  }

  const setLeadStatus = async (leadId: string, status: 'new' | 'handled') => {
    if (!leadId || leadBusy) return
    setLeadBusy(leadId)
    try {
      const res = await fetch(`/api/os/leads/${encodeURIComponent(leadId)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) return
      setLeadOverrides((prev) => ({ ...prev, [leadId]: status }))
      window.dispatchEvent(new CustomEvent('indobase:runtime-updated'))
    } finally {
      setLeadBusy(null)
    }
  }

  return (
    <div className={styles.root}>
      <nav className={styles.nav} aria-label="Business">
        {visibleNav.map((item) => (
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
            {item.id === 'leads' && openLeadCount > 0 ? (
              <span className={styles.navBadge} aria-label={`${openLeadCount} open`}>
                {openLeadCount}
              </span>
            ) : null}
            {item.id === 'orders' && openOrderCount > 0 ? (
              <span className={styles.navBadge} aria-label={`${openOrderCount} pending`}>
                {openOrderCount}
              </span>
            ) : null}
          </button>
        ))}
      </nav>
      <section className={styles.main}>
        <h2 className={styles.hello}>
          {section === 'overview' && surface?.copy.headline ? surface.copy.headline : greeting(displayName)}
        </h2>
        <p className={styles.muted}>
          {section === 'overview' && surface?.copy.body ? surface.copy.body : `${home?.name || brand}${home?.typeLabel ? ` · ${home.typeLabel}` : ''}${liveUrl ? ` · ${hostOf(liveUrl)}` : ''}`}
        </p>
        {rail ? (
          <ol className={styles.lifecycle} aria-label="Business lifecycle">
            {rail.stages.map((step) => (
              <li key={step.id} data-status={step.status}>
                {step.label}
              </li>
            ))}
          </ol>
        ) : null}
        {home?.loading ? <p className={styles.muted}>Updating your business…</p> : null}
        {home?.error ? <p className={styles.error}>{home.error}</p> : null}
        {home?.empty ? <p className={styles.muted}>Nothing here yet — tell me what to build in chat.</p> : null}
        {section === 'overview' ? (
          <>
            {surface?.copy.liveBanner ? <div className={styles.banner}>{surface.copy.liveBanner}</div> : null}
            <div className={styles.metrics}>
              {(home?.metrics || []).map((m) => (
                <div key={m.id} className={styles.metric}>
                  <b>{m.value}</b>
                  <span>{m.label}</span>
                </div>
              ))}
            </div>
            {home?.checkoutStatus ? <p className={styles.muted}>{home.checkoutStatus}</p> : null}
            {home?.paymentsStatus ? <p className={styles.muted}>{home.paymentsStatus}</p> : null}
            {home?.inboxStatus ? (
              <p className={styles.muted}>
                <button
                  type="button"
                  className={styles.linkish}
                  onClick={() => setSection(home.inboxSection || (store ? 'orders' : 'leads'))}
                >
                  {home.inboxStatus}
                </button>
              </p>
            ) : null}
            {!store && openLeadCount > 0 ? (
              <div className={styles.overviewLists}>
                <div>
                  <p className={styles.muted}>Open enquiries</p>
                  <ul className={styles.list}>
                    {leads
                      .filter((lead) => lead.status === 'new')
                      .slice(0, 5)
                      .map((lead) => (
                        <li key={lead.id} className={styles.row}>
                          <span>
                            {lead.name}
                            <span className={styles.muted}>
                              {' '}
                              · {lead.contact}
                              {lead.message ? ` — ${lead.message}` : ''}
                            </span>
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            ) : null}
            {store && (home?.products.length || home?.orders.length) ? (
              <div className={styles.overviewLists}>
                {home?.products.length ? (
                  <div>
                    <p className={styles.muted}>Products</p>
                    <ul className={styles.list}>
                      {home.products.slice(0, 8).map((p) => (
                        <li key={p.name} className={styles.row}>
                          <span>
                            {p.name}
                            <span className={styles.muted}>
                              {' '}
                              · {p.variantCount} variant{p.variantCount === 1 ? '' : 's'}
                              {typeof p.stock === 'number' ? ` · ${p.stock} in stock` : ''}
                            </span>
                          </span>
                          <b>{p.price}</b>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {home?.orders.length ? (
                  <div>
                    <p className={styles.muted}>Orders</p>
                    <ul className={styles.list}>
                      {home.orders.slice(0, 8).map((o) => (
                        <li key={o.id} className={styles.row}>
                          <span>
                            {o.id}
                            <span className={styles.muted}>
                              {' '}
                              · {o.status}
                              {o.createdAt ? ` · ${o.createdAt.slice(0, 10)}` : ''}
                            </span>
                          </span>
                          <b>{o.amount}</b>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className={styles.actions}>
              {(surface?.actions || []).map((a) => (
                <button key={a.label} type="button" onClick={() => pickOperatorMessage(a.message, onPick)}>
                  {a.label}
                </button>
              ))}
              {liveUrl ? (
                <button type="button" data-secondary="" onClick={onOpenStorefront}>
                  Preview
                </button>
              ) : null}
            </div>
          </>
        ) : null}
        {store && section === 'products' ? (
          <div>
            {home?.products.length ? (
              <ul className={styles.list}>
                {home.products.map((p) => (
                  <li key={p.name} className={styles.row}>
                    <span>
                      {p.name}
                      <span className={styles.muted}>
                        {' '}
                        · {p.variantCount} variant{p.variantCount === 1 ? '' : 's'}
                        {typeof p.stock === 'number' ? ` · ${p.stock} in stock` : ''}
                      </span>
                    </span>
                    <b>{p.price}</b>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>No products yet.</p>
            )}
            <div className={styles.actions}>
              <button type="button" onClick={() => send('Add products to my catalog.')}>
                Manage products
              </button>
            </div>
          </div>
        ) : null}
        {store && section === 'orders' ? (
          <div>
            {home?.orders.length ? (
              <ul className={styles.list}>
                {home.orders.map((o) => (
                  <li key={o.id} className={styles.row}>
                    <span>
                      {o.id}
                      <span className={styles.muted}>
                        {' '}
                        · {o.status}
                        {o.createdAt ? ` · ${o.createdAt.slice(0, 10)}` : ''}
                      </span>
                    </span>
                    <b>{o.amount}</b>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>No orders yet.</p>
            )}
            <div className={styles.actions}>
              <button type="button" onClick={() => send("Show me today's orders.")}>
                View orders
              </button>
            </div>
          </div>
        ) : null}
        {store && section === 'payments' ? (
          <div className={styles.actions}>
            <button type="button" onClick={() => send('Connect payments so customers can pay online.')}>
              Connect payments
            </button>
          </div>
        ) : null}
        {section === 'leads' ? (
          <div>
            {leads.length ? (
              <ul className={styles.list}>
                {leads.map((lead) => (
                  <li key={lead.id} className={styles.row} data-status={lead.status}>
                    <span>
                      {lead.name}
                      <span className={styles.muted}>
                        {' '}
                        · {lead.contact}
                        {lead.receivedAt ? ` · ${lead.receivedAt.slice(0, 10)}` : ''}
                        {lead.status === 'handled' ? ' · handled' : ''}
                      </span>
                      {lead.message ? <span className={styles.muted}> — {lead.message}</span> : null}
                    </span>
                    <button
                      type="button"
                      data-secondary=""
                      disabled={disabled || leadBusy === lead.id}
                      onClick={() =>
                        void setLeadStatus(lead.id, lead.status === 'handled' ? 'new' : 'handled')
                      }
                    >
                      {leadBusy === lead.id
                        ? 'Saving…'
                        : lead.status === 'handled'
                          ? 'Reopen'
                          : 'Mark handled'}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>
                No enquiries yet. They arrive here as soon as someone uses the form on your site.
              </p>
            )}
            <div className={styles.actions}>
              {liveUrl ? (
                <a href={liveUrl} target="_blank" rel="noreferrer">
                  <button type="button" data-secondary="">
                    Open live site
                  </button>
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
        {section === 'settings' ||
        section === 'customers' ||
        section === 'users' ||
        section === 'data' ||
        section === 'content' ||
        section === 'website' ||
        section === 'application' ? (
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
          placeholder="Write a product description, or ask what to do next"
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

function sectionFromUrl(nav: ControlCenterSection[]): string {
  if (typeof window === 'undefined') return nav[0]?.id || 'overview'
  const wanted = readWorkspaceScreenFromSearch(window.location.search)
  if (wanted && nav.some((item) => item.id === wanted)) return wanted
  return nav[0]?.id || 'overview'
}