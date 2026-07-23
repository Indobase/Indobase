import { useParams } from 'common'
import { ExternalLink, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from 'ui'

const DEFAULT_PAYMENTS_URL = 'https://payments.indobase.in'

function getIndobasePaymentsBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_INDOBASE_PAYMENTS_URL?.trim()
  if (!fromEnv) return DEFAULT_PAYMENTS_URL
  return fromEnv.replace(/\/+$/, '')
}

/**
 * Opens the live Indobase Payments product from the project surface.
 * Prefers an in-panel iframe (CSP allows Studio hosts); falls back to same-tab
 * navigation so operators never land on a dead Getting Started card.
 */
export const ProjectPaymentsHome = () => {
  const { ref } = useParams()
  const [iframeFailed, setIframeFailed] = useState(false)
  const [redirecting, setRedirecting] = useState(false)

  const paymentsUrl = useMemo(() => {
    const url = new URL(getIndobasePaymentsBaseUrl())
    url.searchParams.set('from', 'studio')
    if (ref) url.searchParams.set('project_ref', ref)
    return url.toString()
  }, [ref])

  const openPayments = (mode: 'same-tab' | 'new-tab') => {
    if (mode === 'new-tab') {
      window.open(paymentsUrl, '_blank', 'noopener,noreferrer')
      return
    }
    setRedirecting(true)
    window.location.assign(paymentsUrl)
  }

  // If the iframe is blocked (legacy CSP) or errors, fall through to same-tab.
  useEffect(() => {
    if (!iframeFailed) return
    setRedirecting(true)
    const timer = window.setTimeout(() => {
      window.location.assign(paymentsUrl)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [iframeFailed, paymentsUrl])

  if (redirecting || iframeFailed) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 py-16">
        <Loader2 className="h-6 w-6 animate-spin text-foreground-light" aria-hidden />
        <p className="text-sm text-foreground-light">Opening Indobase Payments…</p>
        <Button type="primary" icon={<ExternalLink size={14} />} onClick={() => openPayments('same-tab')}>
          Continue in Indobase Payments
        </Button>
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
