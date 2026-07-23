import { ExternalLink, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from 'ui'

import { usePaymentsLaunch } from './usePaymentsLaunch'

/**
 * Opens the live Indobase Payments product from the project surface using a
 * Studio→Payments handoff token (same pattern as Builder `/launch`).
 * Prefers an in-panel iframe; falls back to same-tab navigation.
 */
export const ProjectPaymentsHome = () => {
  const { isLaunching, launch } = usePaymentsLaunch()
  const [paymentsUrl, setPaymentsUrl] = useState<string | null>(null)
  const [iframeFailed, setIframeFailed] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    setRedirecting(true)
    window.location.assign(paymentsUrl)
  }

  useEffect(() => {
    if (!iframeFailed || !paymentsUrl) return
    setRedirecting(true)
    const timer = window.setTimeout(() => {
      window.location.assign(paymentsUrl)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [iframeFailed, paymentsUrl])

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 py-16">
        <p className="text-sm text-foreground-light">{error}</p>
        <Button type="primary" onClick={() => void launch().then((url) => url && setPaymentsUrl(url))}>
          Retry
        </Button>
      </div>
    )
  }

  if (redirecting || iframeFailed || isLaunching || !paymentsUrl) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 py-16">
        <Loader2 className="h-6 w-6 animate-spin text-foreground-light" aria-hidden />
        <p className="text-sm text-foreground-light">Opening Indobase Payments…</p>
        {paymentsUrl ? (
          <Button type="primary" icon={<ExternalLink size={14} />} onClick={() => openPayments('same-tab')}>
            Continue in Indobase Payments
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-[28rem] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-default bg-surface-100 px-4 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">Indobase Payments</p>
          <p className="truncate text-xs text-foreground-lighter">
            Live product — plans, customers, invoices, and metering
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button type="default" onClick={() => openPayments('same-tab')}>
            Continue in Indobase Payments
          </Button>
          <Button
            type="primary"
            icon={<ExternalLink size={14} />}
            onClick={() => openPayments('new-tab')}
          >
            Open in new tab
          </Button>
        </div>
      </div>
      <iframe
        title="Indobase Payments"
        src={paymentsUrl}
        className="h-full w-full flex-1 border-0 bg-surface-100"
        allow="clipboard-write; payment"
        referrerPolicy="strict-origin-when-cross-origin"
        onError={() => setIframeFailed(true)}
      />
    </div>
  )
}
