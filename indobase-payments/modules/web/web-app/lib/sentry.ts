import * as Sentry from '@sentry/react'

import { env } from '@/lib/env'

/**
 * Indobase Payments web — env-gated Sentry.
 * DSN comes from runtime `window._env` (Docker) or Vite build env.
 */
export function initPaymentsSentry(): boolean {
  const dsn = env.sentryDsn
  if (!dsn) return false

  Sentry.init({
    dsn,
    environment: env.sentryEnvironment,
    tracesSampleRate: 0.001,
    enableLogs: true,
    integrations: [Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] })],
    initialScope: { tags: { service: 'payments-web' } },
  })

  return true
}

export { Sentry }
