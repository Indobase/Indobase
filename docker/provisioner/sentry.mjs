/**
 * Minimal Sentry bootstrap for the data-plane provisioner (no bundler).
 */
import * as Sentry from '@sentry/node'

let initialized = false

export function initProvisionerSentry() {
  if (initialized) return true
  const dsn = (process.env.SENTRY_DSN || '').trim()
  if (!dsn) return false

  Sentry.init({
    dsn,
    environment: (process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'production').trim(),
    tracesSampleRate: 0.001,
    initialScope: { tags: { service: 'provisioner' } },
  })

  process.on('uncaughtException', (err) => {
    console.error('[provisioner] uncaughtException', err)
    Sentry.captureException(err)
    void Sentry.flush(2000).finally(() => process.exit(1))
  })
  process.on('unhandledRejection', (reason) => {
    console.error('[provisioner] unhandledRejection', reason)
    Sentry.captureException(reason)
  })

  initialized = true
  return true
}

export function captureProvisionerException(err) {
  if (!initialized) return
  Sentry.captureException(err)
}

export { Sentry }
