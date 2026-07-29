import { useCallback, useEffect, useState } from 'react'

import {
  confirmPurchase,
  createPurchaseIntent,
  fetchMe,
  formatInr,
  listRegistrations,
  searchDomains,
  type DomainRegistration,
  type DomainSearchResult,
  type MeResponse,
} from './lib/api'
import { openRazorpayCheckout } from './lib/razorpay'

export function App() {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DomainSearchResult[]>([])
  const [registrations, setRegistrations] = useState<DomainRegistration[]>([])
  const [loadingMe, setLoadingMe] = useState(true)
  const [searching, setSearching] = useState(false)
  const [buyingDomain, setBuyingDomain] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const refreshRegistrations = useCallback(async () => {
    const rows = await listRegistrations()
    setRegistrations(rows)
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const profile = await fetchMe()
        setMe(profile)
        await refreshRegistrations()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load session')
      } finally {
        setLoadingMe(false)
      }
    })()
  }, [refreshRegistrations])

  const runSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    setError(null)
    setSuccess(null)
    try {
      const rows = await searchDomains(query.trim(), 1)
      setResults(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  const buyDomain = async (domain: DomainSearchResult) => {
    setBuyingDomain(domain.domainName)
    setError(null)
    setSuccess(null)

    try {
      const intent = await createPurchaseIntent(domain.domainName, domain.years ?? 1)
      const payment = await openRazorpayCheckout({
        keyId: intent.razorpay.key_id,
        orderId: intent.razorpay.order_id,
        amount: intent.razorpay.amount,
        currency: intent.razorpay.currency,
        name: 'Indobase Domains',
        description: `Register ${intent.registration.domain_name}`,
        prefill: me?.email ? { email: me.email } : undefined,
      })

      const confirmed = await confirmPurchase({
        registration_id: intent.registration.id,
        razorpay_order_id: payment.razorpay_order_id,
        razorpay_payment_id: payment.razorpay_payment_id,
        razorpay_signature: payment.razorpay_signature,
      })

      setSuccess(
        `${confirmed.registration.domain_name} is registered. Connect it under Custom Domains in Studio when you're ready.`
      )
      await refreshRegistrations()
      setResults([])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Checkout failed'
      if (message !== 'Checkout closed') {
        setError(message)
      }
    } finally {
      setBuyingDomain(null)
    }
  }

  if (loadingMe) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <p className="lead">Loading Domains…</p>
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <strong>Indobase Domains</strong>
          <div className="meta">
            {me?.projectName || me?.projectRef} · {me?.email}
          </div>
        </div>
        {me?.attachCustomDomainsUrl ? (
          <a href={me.attachCustomDomainsUrl} className="secondary-link">
            Attach in Studio
          </a>
        ) : null}
      </header>

      <main className="app-main">
        <section className="card">
          <h1>Buy a domain</h1>
          <p className="lead">
            Search availability, pay in INR, and register a domain for this project. After
            registration, attach it under Settings → Custom Domains in Studio.
          </p>

          <div className="search-row">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void runSearch()
              }}
              placeholder="yourbrand or yourbrand.com"
            />
            <button type="button" className="primary" disabled={searching} onClick={() => void runSearch()}>
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>

          {error ? <div className="alert error">{error}</div> : null}
          {success ? <div className="alert success">{success}</div> : null}

          {results.length > 0 ? (
            <div className="results">
              {results.map((row) => (
                <div key={row.domainName} className="result-row">
                  <div>
                    <div className="domain">{row.domainName}</div>
                    <div className="sub">
                      {row.purchasable ? 'Available' : 'Unavailable'}
                      {row.premium ? ' · Premium' : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {row.purchasable && row.customerPriceInr != null ? (
                      <>
                        <span>{formatInr(row.customerPriceInr)}/yr</span>
                        <button
                          type="button"
                          className="secondary"
                          disabled={buyingDomain === row.domainName}
                          onClick={() => void buyDomain(row)}
                        >
                          {buyingDomain === row.domainName ? 'Processing…' : 'Buy'}
                        </button>
                      </>
                    ) : (
                      <span className="sub">Not for sale</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="card">
          <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Your domains</h2>
          <p className="lead" style={{ marginBottom: 16 }}>
            Registrations linked to this project.
          </p>
          {registrations.length === 0 ? (
            <p className="empty">No domains purchased yet.</p>
          ) : (
            <div className="results">
              {registrations.map((row) => (
                <div key={row.id} className="result-row">
                  <div>
                    <div className="domain">{row.domain_name}</div>
                    <div className="sub">
                      {row.years} year{row.years === 1 ? '' : 's'} · {formatInr(row.customer_price_inr_paise / 100)}
                    </div>
                    {row.last_error ? <div className="sub" style={{ color: '#dc2626' }}>{row.last_error}</div> : null}
                  </div>
                  <span className={`status-pill ${row.status}`}>{row.status.replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
