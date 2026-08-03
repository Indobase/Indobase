/**
 * Indobase Builder — Sentry (server + shared helpers).
 * Client init lives in entry.client.tsx; DSN may come from VITE_ or runtime env.
 */
import * as Sentry from '@sentry/remix';

let initialized = false;

export function initBuilderSentry(opts?: { dsn?: string; service?: string }) {
  if (initialized) return true;

  const dsn = (
    opts?.dsn ||
    process.env.SENTRY_DSN ||
    process.env.VITE_SENTRY_DSN ||
    ''
  ).trim();

  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: (process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'production').trim(),
    tracesSampleRate: 0.001,
    initialScope: {
      tags: { service: opts?.service || 'builder' },
    },
  });

  initialized = true;
  return true;
}

export { Sentry };
