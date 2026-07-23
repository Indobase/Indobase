import { ExternalLink, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from 'ui'

import { usePaymentsLaunch } from './usePaymentsLaunch'

/**
 * Opens the live Indobase Payments product from the project surface using a
 * Studio→Payments handoff token (same pattern as Builder `/launch`).
 *
 * Same-tab navigation is the primary UX: the handoff redirects through
 * `api.payments.indobase.in` and sets a first-party session, which is unreliable
 * inside a cross-origin iframe (Studio CSP `frame-src`, third-party cookie
 * blocking, Brave shields). Embedding previously showed Chromium's empty/sad
 * document instead of Payments.
 */
export const ProjectPaymentsHome = () => {
  const { launch } = usePaymentsLaunch()
  const [paymentsUrl, setPaymentsUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const redirectedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const url = await launch()
      if (cancelled) return
      if (!url) {
        setError('Could not start Indobase Payments session')
        return
      }
      setPaymentsUrl(url)
      if (!redirectedRef.current) {
        redirectedRef.current = true
        window.location.assign(url)
      }
    })()
    return () => {
      cancelled = true
    }
    // Intentionally once on mount — launch() is stable per project ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openPayments = (mode: 'same-tab' | 'new-tab') => {
    if (!paymentsUrl) return
    if (mode === 'new-tab') {
      window.open(paymentsUrl, '_blank', 'noopener,noreferrer')
      return
    }
    window.location.assign(paymentsUrl)
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 py-16">
        <p className="text-sm text-foreground-light">{error}</p>
        <Button
          type="primary"
          onClick={() => {
            redirectedRef.current = false
            void launch().then((url) => {
              if (!url) {
                setError('Could not start Indobase Payments session')
                return
              }
              setError(null)
              setPaymentsUrl(url)
              redirectedRef.current = true
              window.location.assign(url)
            })
          }}
        >
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 py-16">
      <Loader2 className="h-6 w-6 animate-spin text-foreground-light" aria-hidden />
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-foreground">Opening Indobase Payments…</p>
        <p className="mt-1 text-xs text-foreground-lighter">
          Live product — plans, customers, invoices, and metering
        </p>
      </div>
      {paymentsUrl ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="primary" icon={<ExternalLink size={14} />} onClick={() => openPayments('same-tab')}>
            Continue in Indobase Payments
          </Button>
          <Button type="default" icon={<ExternalLink size={14} />} onClick={() => openPayments('new-tab')}>
            Open in new tab
          </Button>
        </div>
      ) : null}
    </div>
  )
}
