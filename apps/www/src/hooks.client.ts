import { handleErrorWithSentry } from '@sentry/sveltekit';
import * as Sentry from '@sentry/sveltekit';
import { env as publicEnv } from '$env/dynamic/public';

// Live /docs is this SvelteKit site (apps/www), not apps/docs Next.js.
// Prefer the dedicated docs project DSN on docs routes; otherwise website DSN.
const path = typeof window !== 'undefined' ? window.location.pathname : '';
const docsDsn = publicEnv.PUBLIC_SENTRY_DSN_DOCS?.trim() || '';
const websiteDsn = publicEnv.PUBLIC_SENTRY_DSN?.trim() || '';
const dsn = path.startsWith('/docs') && docsDsn ? docsDsn : websiteDsn;

if (dsn) {
    Sentry.init({
        dsn,
        environment: publicEnv.PUBLIC_SENTRY_ENVIRONMENT?.trim() || 'production',
        tracesSampleRate: 0.001,
        enableLogs: true,
        integrations: [Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] })],
        initialScope: {
            tags: { service: path.startsWith('/docs') ? 'docs' : 'website' }
        }
    });
}

export function init() {}
export const handleError = handleErrorWithSentry();
