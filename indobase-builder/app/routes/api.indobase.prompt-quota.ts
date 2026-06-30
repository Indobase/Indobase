import { json, type LoaderFunctionArgs } from '@remix-run/node';

import {
  getBuilderPromptQuotaFromStudio,
  resolveBuilderMcpClaims,
} from '~/lib/indobase/builder-prompt-quota.server';
import { withSecurity } from '~/lib/security';

async function promptQuotaLoader({ request, context }: LoaderFunctionArgs) {
  const env = (context as { cloudflare?: { env?: Record<string, string | undefined> } })?.cloudflare?.env;
  const claims = await resolveBuilderMcpClaims(request, env);

  if (!claims) {
    return json({ error: 'Unauthorized', statusCode: 401 }, { status: 401 });
  }

  const quota = await getBuilderPromptQuotaFromStudio(request, env);

  if (!quota) {
    return json({ error: 'Unable to load prompt quota', statusCode: 502 }, { status: 502 });
  }

  return json({
    ...quota,
    organizationSlug: claims.organization_slug,
    projectRef: claims.project_ref,
    studioUrl: claims.studio_url,
  });
}

export const loader = withSecurity(promptQuotaLoader, { requireAuth: true });
