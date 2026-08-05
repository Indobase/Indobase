import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import {
  probeWebContainerHeadless,
  resolveBuilderPublicOrigin,
} from '~/lib/webcontainer/headless-probe.server';
import { withSecurity } from '~/lib/security';

/**
 * Public (non-secret) Builder bootstrap values for the browser.
 * WEBCONTAINER_API_KEY is a StackBlitz *client* key — domain-restricted, safe to expose —
 * same class as a Stripe publishable key. Required on production hosts for preview to boot.
 */
async function runtimePublicEnvLoader({ request, context }: LoaderFunctionArgs) {
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

  const forceServerPreview =
    env?.BUILDER_FORCE_SERVER_PREVIEW === 'true' || process.env.BUILDER_FORCE_SERVER_PREVIEW === 'true';

  let webcontainerHeadlessOk: boolean | undefined;

  if (forceServerPreview) {
    webcontainerHeadlessOk = false;
  } else if (webcontainerApiKey) {
    const origin = resolveBuilderPublicOrigin(request.url, env);
    webcontainerHeadlessOk = await probeWebContainerHeadless(webcontainerApiKey, origin);
  }

  return json(
    {
      webcontainerApiKey,
      sentryDsn,
      webcontainerHeadlessOk,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}

export const loader = withSecurity(runtimePublicEnvLoader, { requireAuth: false });
