import { handleErrorWithSentry } from '@sentry/sveltekit';
import * as Sentry from '@sentry/sveltekit';
import { env as publicEnv } from '$env/dynamic/public';

const dsn = publicEnv.PUBLIC_SENTRY_DSN?.trim() || '';

if (dsn) {
    Sentry.init({
        dsn,
        environment: publicEnv.PUBLIC_SENTRY_ENVIRONMENT?.trim() || 'production',
        tracesSampleRate: 0.001
    });
}

export function init() {}
export const handleError = handleErrorWithSentry();
