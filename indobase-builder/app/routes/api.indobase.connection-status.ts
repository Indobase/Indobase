import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { parseCookies } from '~/lib/api/cookies';
import { readBearerToken, resolveValidBuilderMcpToken } from '~/lib/indobase/builder-auth.server';
import { verifyIndobaseBuilderMcpToken } from '~/lib/indobase/handoff.server';
import { BUILDER_MCP_COOKIE } from '~/lib/indobase/builder-session.constants';
import { withSecurity } from '~/lib/security';

async function connectionStatusLoader({ request, context }: LoaderFunctionArgs) {
  const env = (context as { cloudflare?: { env?: Record<string, string | undefined> } })?.cloudflare?.env;
  const cookies = parseCookies(request.headers.get('Cookie'));
  const validToken = await resolveValidBuilderMcpToken(
    [readBearerToken(request), cookies[BUILDER_MCP_COOKIE]],
    env,
  );

  if (!validToken) {
    return json({ error: 'No active Indobase Builder session. Open Builder from Studio.' }, { status: 401 });
  }

  const claims = await verifyIndobaseBuilderMcpToken(validToken, env);

  return json({
    connected: true,
    projectRef: claims.project_ref,
    studioUrl: claims.studio_url,
    organizationSlug: claims.organization_slug,
    projects: [
      {
        id: claims.project_ref,
        name: claims.project_ref,
        region: 'indobase',
        status: 'active',
      },
    ],
  });
}

export const loader = withSecurity(connectionStatusLoader, {
  rateLimit: false,
});
