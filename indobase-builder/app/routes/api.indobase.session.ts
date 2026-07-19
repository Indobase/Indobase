import { json, type ActionFunctionArgs } from '@remix-run/node';
import { parseCookies } from '~/lib/api/cookies';
import { readBearerToken, resolveValidBuilderMcpToken } from '~/lib/indobase/builder-auth.server';
import { verifyIndobaseBuilderMcpToken } from '~/lib/indobase/handoff.server';
import {
  BUILDER_MCP_COOKIE,
  BUILDER_MCP_TOKEN_TTL_SECONDS,
} from '~/lib/indobase/builder-session.constants';

type SessionBody = {
  mcpToken?: string;
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  let body: SessionBody = {};

  try {
    body = (await request.json()) as SessionBody;
  } catch {
    body = {};
  }

  const env = (context as { cloudflare?: { env?: Record<string, string | undefined> } })?.cloudflare?.env;
  const cookies = parseCookies(request.headers.get('Cookie'));
  const validToken = await resolveValidBuilderMcpToken(
    [body.mcpToken, readBearerToken(request), cookies[BUILDER_MCP_COOKIE]],
    env,
  );

  if (!validToken) {
    return json(
      {
        error: 'Invalid or expired Builder session token',
        statusCode: 401,
      },
      { status: 401 },
    );
  }

  const claims = await verifyIndobaseBuilderMcpToken(validToken, env);
  const maxAge = BUILDER_MCP_TOKEN_TTL_SECONDS;
  const nodeEnv = env?.NODE_ENV ?? process.env.NODE_ENV;
  const secure = nodeEnv === 'production' ? '; Secure' : '';

  return json(
    {
      success: true,
      mcpToken: validToken,
      projectRef: claims.project_ref,
      studioUrl: claims.studio_url,
      organizationSlug: claims.organization_slug,
      email: claims.email,
      sub: claims.sub,
      expiresAt: claims.exp * 1000,
    },
    {
      headers: {
        'Set-Cookie': `${BUILDER_MCP_COOKIE}=${validToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`,
      },
    },
  );
};
