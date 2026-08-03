import { RemixBrowser } from '@remix-run/react';
import * as Sentry from '@sentry/remix';
import { startTransition, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';

function initClientSentry(dsn: string) {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE || 'production',
    tracesSampleRate: 0.001,
    integrations: [Sentry.browserTracingIntegration()],
  });
}

const bakeDsn = ((import.meta.env.VITE_SENTRY_DSN as string | undefined) || '').trim();
initClientSentry(bakeDsn);

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <RemixBrowser />
    </StrictMode>,
  );
});

// Runtime DSN (Swarm env) — hydrate after boot if bake-time DSN was empty.
if (!bakeDsn && typeof window !== 'undefined') {
  void fetch('/api/runtime-public-env', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data: { sentryDsn?: string } | null) => {
      const dsn = data?.sentryDsn?.trim() || '';
      if (dsn) initClientSentry(dsn);
    })
    .catch(() => {});
}
