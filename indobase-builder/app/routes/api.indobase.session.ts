import { json, type ActionFunctionArgs } from '@remix-run/node';
import { verifyIndobaseBuilderMcpToken } from '~/lib/indobase/handoff.server';

const BUILDER_MCP_COOKIE = 'indobase_builder_mcp';

type SessionBody = {
  mcpToken?: string;
};

function readBearerToken(authorization: string | null): string | null {
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice('Bearer '.length).trim();
  return token || null;
}

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
  const token = body.mcpToken?.trim() || readBearerToken(request.headers.get('Authorization'));

  if (!token) {
    return json({ error: 'Builder session token is required' }, { status: 400 });
  }

  try {
    await verifyIndobaseBuilderMcpToken(token, env);
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : 'Invalid Builder session token',
      },
      { status: 401 },
    );
  }

  const maxAge = 60 * 60 * 12;
  const nodeEnv = env?.NODE_ENV ?? process.env.NODE_ENV;
  const secure = nodeEnv === 'production' ? '; Secure' : '';

  return json(
    { success: true },
    {
      headers: {
        'Set-Cookie': `${BUILDER_MCP_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`,
      },
    },
  );
};
