import { RemixBrowser } from '@remix-run/react';
import * as Sentry from '@sentry/remix';
import { startTransition, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';

/**
 * Sentry must never block or break hydrate. Calling `browserTracingIntegration()` with no Remix
 * router hooks throws (`instrumentPageLoad` on undefined) and was leaving ClientOnly stuck on the
 * SSR "Loading Indobase Builder…" fallback in production.
 */
function initClientSentry(dsn: string) {
  if (!dsn) {
    return;
  }

  try {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE || 'production',
      tracesSampleRate: 0,
      // No browserTracingIntegration here — requires Remix useEffect/useLocation/useMatches and
      // must not run before hydrate. Error monitoring still works without performance tracing.
      integrations: [],
    });
  } catch (error) {
    console.warn('[sentry] client init failed (non-fatal)', error);
  }
}

// Hydrate first — analytics/Sentry must not gate React boot.
startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <RemixBrowser />
    </StrictMode>,
  );
});

function bootClientSentry() {
  try {
    const bakeDsn = ((import.meta.env.VITE_SENTRY_DSN as string | undefined) || '').trim();
    const runtimeDsn =
      (typeof window !== 'undefined' ? window.__INDOBASE_BUILDER_PUBLIC__?.sentryDsn?.trim() : '') || '';
    const dsn = bakeDsn || runtimeDsn;

    if (dsn) {
      initClientSentry(dsn);
      return;
    }

    void fetch('/api/runtime-public-env', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { sentryDsn?: string } | null) => {
        const fromApi = data?.sentryDsn?.trim() || '';
        if (fromApi) {
          initClientSentry(fromApi);
        }
      })
      .catch(() => {});
  } catch (error) {
    console.warn('[sentry] client boot failed (non-fatal)', error);
  }
}

if (typeof window !== 'undefined') {
  // Defer until after the first paint/hydrate commit so ClientOnly/useHydrated can flip.
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      queueMicrotask(bootClientSentry);
    });
  } else {
    setTimeout(bootClientSentry, 0);
  }
}
