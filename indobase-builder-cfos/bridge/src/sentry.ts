/**
 * Sentry bootstrap for Indobase OS (Gen 3 CFOS bridge).
 */
import * as Sentry from '@sentry/node'
import type { ErrorHandler } from 'hono'

let initialized = false

export function resolveSentryDsn(): string {
  return (process.env.SENTRY_DSN || process.env.PUBLIC_SENTRY_DSN || '').trim()
}

export function initBridgeSentry(service = 'builder-cfos'): boolean {
  if (initialized) return true

  const dsn = resolveSentryDsn()
  if (!dsn) return false

  Sentry.init({
    dsn,
    environment: (process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'production').trim(),
    release: (process.env.GIT_SHA || process.env.BUILDER_CFOS_VERSION || '').trim() || undefined,
    tracesSampleRate: 0.001,
    enableLogs: true,
    integrations: [Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] })],
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

export function bridgeSentryOnError(service = 'builder-cfos'): ErrorHandler {
  return (err, c) => {
    console.error(`[${service}]`, err)
    Sentry.captureException(err)
    return c.json({ error: 'internal_error' }, 500)
  }
}

/** Inline browser SDK bootstrap for the proxied CFOS desktop HTML. */
export function injectBrowserSentry(html: string): string {
  const dsn = resolveSentryDsn()
  if (!dsn) return html

  const environment = (process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'production').trim()
  const release = (process.env.GIT_SHA || process.env.BUILDER_CFOS_VERSION || '').trim()
  const script = `<script
  src="https://browser.sentry-cdn.com/9.46.0/bundle.min.js"
  crossorigin="anonymous"
></script>
<script>
(function () {
  if (!window.Sentry || !window.Sentry.init) return;
  try {
    window.Sentry.init({
      dsn: ${JSON.stringify(dsn)},
      environment: ${JSON.stringify(environment)},
      release: ${JSON.stringify(release || undefined)},
      tracesSampleRate: 0.001,
      ignoreErrors: [
        /Failed to fetch dynamically imported module/i,
        /Importing a module script failed/i,
        /error loading dynamically imported module/i,
      ],
    });
  } catch (e) {
    console.warn('[sentry] browser init failed (non-fatal)', e);
  }
})();
</script>`

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${script}</head>`)
  }
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${script}</body>`)
  }
  return `${script}${html}`
}

export { Sentry }
