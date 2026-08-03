/**
 * Shared Sentry bootstrap for Indobase SSO bridges (Node + Hono).
 * Copy lives in each bridge package so deps stay local.
 */
import * as Sentry from '@sentry/node'
import type { ErrorHandler } from 'hono'

let initialized = false

export function initBridgeSentry(service: string): boolean {
  if (initialized) return true

  const dsn = (process.env.SENTRY_DSN || '').trim()
  if (!dsn) return false

  Sentry.init({
    dsn,
    environment: (process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'production').trim(),
    tracesSampleRate: 0.001,
    initialScope: { tags: { service } },
  })

  process.on('uncaughtException', (err) => {
    console.error(`[${service}] uncaughtException`, err)
    Sentry.captureException(err)
    void Sentry.flush(2000).finally(() => process.exit(1))
  })

  process.on('unhandledRejection', (reason) => {
    console.error(`[${service}] unhandledRejection`, reason)
    Sentry.captureException(reason)
  })

  initialized = true
  return true
}

export function bridgeSentryOnError(service: string): ErrorHandler {
  return (err, c) => {
    console.error(`[${service}]`, err)
    Sentry.captureException(err)
    return c.json({ error: 'internal_error' }, 500)
  }
}

export { Sentry }
