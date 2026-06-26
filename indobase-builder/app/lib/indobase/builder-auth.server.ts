import { verifyIndobaseBuilderMcpToken } from '~/lib/indobase/handoff.server';
import { parseCookies } from '~/lib/api/cookies';

const BUILDER_MCP_COOKIE = 'indobase_builder_mcp';

export function readBearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

type ServerEnv = Record<string, string | undefined>;

export function isBuilderAuthBypassEnabled(env?: ServerEnv): boolean {
  return (
    env?.BUILDER_ALLOW_UNAUTHENTICATED === 'true' || process.env.BUILDER_ALLOW_UNAUTHENTICATED === 'true'
  );
}

export async function verifyBuilderRequestAuth(
  request: Request,
  env?: ServerEnv,
): Promise<boolean> {
  if (isBuilderAuthBypassEnabled(env)) {
    return true;
  }

  const cookies = parseCookies(request.headers.get('Cookie'));
  const bearer = readBearerToken(request);
  const cookieToken = cookies[BUILDER_MCP_COOKIE]?.trim() ?? null;
  const candidates = [...new Set([bearer, cookieToken].filter(Boolean))] as string[];

  for (const token of candidates) {
    try {
      await verifyIndobaseBuilderMcpToken(token, env);
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

export async function resolveValidBuilderMcpToken(
  tokens: Array<string | null | undefined>,
  env?: ServerEnv,
): Promise<string | null> {
  const candidates = [...new Set(tokens.map((token) => token?.trim()).filter(Boolean))] as string[];

  for (const token of candidates) {
    try {
      await verifyIndobaseBuilderMcpToken(token, env);
      return token;
    } catch {
      continue;
    }
  }

  return null;
}
