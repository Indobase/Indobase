import { verifyIndobaseBuilderMcpToken } from '~/lib/indobase/handoff.server';
import { parseCookies } from '~/lib/api/cookies';

const BUILDER_MCP_COOKIE = 'indobase_builder_mcp';

export function readBearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

export function isBuilderAuthBypassEnabled(): boolean {
  return process.env.BUILDER_ALLOW_UNAUTHENTICATED === 'true';
}

export async function verifyBuilderRequestAuth(request: Request): Promise<boolean> {
  if (isBuilderAuthBypassEnabled()) {
    return true;
  }

  const cookies = parseCookies(request.headers.get('Cookie'));
  const token = readBearerToken(request) ?? cookies[BUILDER_MCP_COOKIE]?.trim() ?? null;
  if (!token) {
    return false;
  }

  try {
    await verifyIndobaseBuilderMcpToken(token);
    return true;
  } catch {
    return false;
  }
}
