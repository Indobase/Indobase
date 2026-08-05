/**
 * Indobase Analytics — Sentry bootstrap for the Fastify API.
 */
import * as Sentry from '@sentry/node'

let initialized = false

export function initAnalyticsServerSentry(): boolean {
  if (initialized) return true

  const dsn = (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || '').trim()
  if (!dsn) return false

  Sentry.init({
    dsn,
    environment: (
      process.env.SENTRY_ENVIRONMENT ||
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
      process.env.NODE_ENV ||
      'production'
    ).trim(),
    tracesSampleRate: 0.001,
    enableLogs: true,
    integrations: [Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] })],
    initialScope: { tags: { service: 'analytics-api' } },
  })

  process.on('uncaughtException', (err) => {
    console.error('[analytics] uncaughtException', err)
    Sentry.captureException(err)
    void Sentry.flush(2000).finally(() => process.exit(1))
  })

  process.on('unhandledRejection', (reason) => {
    console.error('[analytics] unhandledRejection', reason)
    Sentry.captureException(reason)
  })

  initialized = true
  return true
}

export { Sentry }
