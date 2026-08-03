/**
 * Indobase Design — Sentry bootstrap (Node + Hono).
 */
import * as Sentry from '@sentry/node'
import type { ErrorHandler } from 'hono'

let initialized = false

export function initDesignSentry(): boolean {
  if (initialized) return true

  const dsn = (process.env.SENTRY_DSN || '').trim()
  if (!dsn) return false

  Sentry.init({
    dsn,
    environment: (process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'production').trim(),
    tracesSampleRate: 0.001,
    enableLogs: true,
    integrations: [Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] })],
    initialScope: { tags: { service: 'design' } },
  })

  process.on('uncaughtException', (err) => {
    console.error('[design] uncaughtException', err)
    Sentry.captureException(err)
    void Sentry.flush(2000).finally(() => process.exit(1))
  })

  process.on('unhandledRejection', (reason) => {
    console.error('[design] unhandledRejection', reason)
    Sentry.captureException(reason)
  })

  initialized = true
  return true
}

export function designSentryOnError(): ErrorHandler {
  return (err, c) => {
    console.error('[design]', err)
    Sentry.captureException(err)
    return c.json({ error: 'internal_error' }, 500)
  }
}

export { Sentry }
