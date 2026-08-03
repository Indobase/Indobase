import { useState } from 'react'
import * as Sentry from '@sentry/nextjs'

/**
 * Dev-only Sentry + Session Replay verification page. Disabled in production builds
 * unless SENTRY_ALLOW_EXAMPLE=true (server gate is on the API; this page is still
 * tree-shaken only by not linking it — keep a client guard for safety).
 */
export default function SentryExamplePage() {
  const [lastMarker, setLastMarker] = useState<string | null>(null)
  const [apiResult, setApiResult] = useState<string | null>(null)
  const blocked =
    typeof process !== 'undefined' &&
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PUBLIC_SENTRY_ALLOW_EXAMPLE !== 'true'

  if (blocked) {
    return (
      <div style={{ fontFamily: 'system-ui', maxWidth: 560, margin: '48px auto', padding: 24 }}>
        <h1>Not found</h1>
      </div>
    )
  }

  const triggerClientError = () => {
    const marker = `Sentry client test error ${new Date().toISOString()}`
    setLastMarker(marker)
    Sentry.captureException(new Error(marker), {
      tags: { sentry_setup_verification: 'true' },
      extra: { source: 'sentry-example-page' },
    })
    setTimeout(() => {
      throw new Error(marker)
    }, 0)
  }

  const triggerApiError = async () => {
    const res = await fetch('/api/sentry-example-api')
    const body = (await res.json()) as { marker?: string; message?: string }
    setApiResult(body.marker ?? body.message ?? 'sent')
  }

  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 560, margin: '48px auto', padding: 24 }}>
      <h1>Sentry example</h1>
      <p>
        Project: <code>indobase/studio</code>
      </p>
      <p style={{ color: '#666', fontSize: 14 }}>
        Client events respect cookie consent + SaaS gates. Use the API button for a reliable server-side
        verification that bypasses those gates.
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24 }}>
        <button type="button" onClick={triggerClientError}>
          Throw client test error
        </button>
        <button type="button" onClick={() => void triggerApiError()}>
          Trigger API test error
        </button>
      </div>
      {lastMarker && (
        <p style={{ marginTop: 16 }}>
          Client marker: <code>{lastMarker}</code>
        </p>
      )}
      {apiResult && (
        <p style={{ marginTop: 8 }}>
          API marker: <code>{apiResult}</code>
        </p>
      )}
    </div>
  )
}
