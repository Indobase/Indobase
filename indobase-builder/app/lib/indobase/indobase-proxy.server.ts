import { json } from '@remix-run/node';

import { parseCookies } from '~/lib/api/cookies';
import { readBearerToken, resolveValidBuilderMcpToken } from '~/lib/indobase/builder-auth.server';
import { verifyIndobaseBuilderMcpToken } from '~/lib/indobase/handoff.server';
import { isAllowedStudioOrigin, normalizeOrigin } from '~/lib/production.server';

type ServerEnv = Record<string, string | undefined>;

export type VerifiedIndobaseProxyContext = {
  mcpToken: string;
  projectRef: string;
  studioUrl: string;
};

export async function verifyIndobaseProxyRequest(
  request: Request,
  body: {
    mcpToken?: string;
    projectRef?: string;
    studioUrl?: string;
  },
  env?: ServerEnv,
): Promise<VerifiedIndobaseProxyContext> {
  const cookies = parseCookies(request.headers.get('Cookie'));
  const mcpToken = await resolveValidBuilderMcpToken(
    [body.mcpToken, readBearerToken(request), cookies.indobase_builder_mcp],
    env,
  );

  if (!mcpToken) {
    throw json({ error: 'Builder authorization is required' }, { status: 401 });
  }

  let claims;

  try {
    claims = await verifyIndobaseBuilderMcpToken(mcpToken, env);
  } catch (error) {
    throw json(
      {
        error: error instanceof Error ? error.message : 'Invalid Builder authorization token',
      },
      { status: 401 },
    );
  }

  const requestedStudioUrl = body.studioUrl?.trim();
  const requestedProjectRef = body.projectRef?.trim();
  const trustedStudioUrl = normalizeOrigin(claims.studio_url);

  if (requestedStudioUrl && normalizeOrigin(requestedStudioUrl) !== trustedStudioUrl) {
    throw json({ error: 'Studio URL does not match Builder session' }, { status: 403 });
  }

  if (requestedProjectRef && requestedProjectRef !== claims.project_ref) {
    throw json({ error: 'Project ref does not match Builder session' }, { status: 403 });
  }

  if (!isAllowedStudioOrigin(trustedStudioUrl)) {
    throw json({ error: 'Studio URL is not allowed' }, { status: 403 });
  }

  return {
    mcpToken,
    projectRef: claims.project_ref,
    studioUrl: trustedStudioUrl,
  };
}
