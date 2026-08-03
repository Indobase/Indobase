import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';

/**
 * Public (non-secret) Builder bootstrap values for the browser.
 * WEBCONTAINER_API_KEY is a StackBlitz *client* key — domain-restricted, safe to expose —
 * same class as a Stripe publishable key. Required on production hosts for preview to boot.
 */
async function runtimePublicEnvLoader({ context }: LoaderFunctionArgs) {
  const env = (context as { cloudflare?: { env?: Record<string, string | undefined> } })?.cloudflare?.env;
  const webcontainerApiKey =
    env?.WEBCONTAINER_API_KEY?.trim() ||
    env?.VITE_WEBCONTAINER_API_KEY?.trim() ||
    process.env.WEBCONTAINER_API_KEY?.trim() ||
    process.env.VITE_WEBCONTAINER_API_KEY?.trim() ||
    '';

  const sentryDsn =
    env?.SENTRY_DSN?.trim() ||
    env?.VITE_SENTRY_DSN?.trim() ||
    process.env.SENTRY_DSN?.trim() ||
    process.env.VITE_SENTRY_DSN?.trim() ||
    '';

  return json(
    {
      webcontainerApiKey,
      sentryDsn,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}

export const loader = withSecurity(runtimePublicEnvLoader, { requireAuth: false });
