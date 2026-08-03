import * as Sentry from '@sentry/sveltekit';

const dsn = (process.env.SENTRY_DSN || process.env.PUBLIC_SENTRY_DSN || '').trim();

if (dsn) {
    Sentry.init({
        dsn,
        environment: (process.env.SENTRY_ENVIRONMENT || process.env.PUBLIC_SENTRY_ENVIRONMENT || 'production').trim(),
        tracesSampleRate: 0.001
    });
}
