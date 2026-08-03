// This file configures the initialization of Sentry on the client.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'

const dsn = (process.env.NEXT_PUBLIC_SENTRY_DSN || '').trim()

if (dsn) {
  Sentry.init({
    dsn,
    environment: (process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'production').trim(),
    tracesSampleRate: 0.001,
    enableLogs: true,
    integrations: [Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] })],
    debug: false,
  })
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
