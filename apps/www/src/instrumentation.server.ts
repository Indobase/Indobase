import * as Sentry from '@sentry/sveltekit';

// Server process covers both marketing and /docs; tag as website.
// Docs-route client events use PUBLIC_SENTRY_DSN_DOCS (see hooks.client.ts).
const dsn = (process.env.SENTRY_DSN || process.env.PUBLIC_SENTRY_DSN || '').trim();

if (dsn) {
    Sentry.init({
        dsn,
        environment: (process.env.SENTRY_ENVIRONMENT || process.env.PUBLIC_SENTRY_ENVIRONMENT || 'production').trim(),
        tracesSampleRate: 0.001,
        enableLogs: true,
        integrations: [Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] })],
        initialScope: { tags: { service: 'website' } }
    });
}
