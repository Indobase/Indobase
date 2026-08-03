/**
 * Indobase Video — Sentry bootstrap for the SSO/static server.
 */
import * as Sentry from '@sentry/node'

let initialized = false

export function initVideoSentry() {
  if (initialized) return true

  const dsn = (process.env.SENTRY_DSN || '').trim()
  if (!dsn) return false

  Sentry.init({
    dsn,
    environment: (process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'production').trim(),
    tracesSampleRate: 0.001,
    enableLogs: true,
    integrations: [Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] })],
    initialScope: { tags: { service: 'video' } },
  })

  process.on('uncaughtException', (err) => {
    console.error('[video] uncaughtException', err)
    Sentry.captureException(err)
    void Sentry.flush(2000).finally(() => process.exit(1))
  })

  process.on('unhandledRejection', (reason) => {
    console.error('[video] unhandledRejection', reason)
    Sentry.captureException(reason)
  })

  initialized = true
  return true
}

export { Sentry }
