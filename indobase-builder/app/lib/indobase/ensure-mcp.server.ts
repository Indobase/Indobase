import { parseCookies } from '~/lib/api/cookies';
import { readBearerToken, resolveValidBuilderMcpToken } from '~/lib/indobase/builder-auth.server';
import { resolveBuilderMcpClaims } from '~/lib/indobase/builder-prompt-quota.server';
import { BUILDER_MCP_COOKIE } from '~/lib/indobase/builder-session.constants';
import { INDOBASE_MCP_SERVER_NAME } from '~/lib/indobase/mcp';
import type { MCPConfig } from '~/lib/services/mcpService';
import type { MCPService } from '~/lib/services/mcpService';

type ServerEnv = Record<string, string | undefined>;

function buildIndobaseMcpUrl(studioUrl: string, projectRef: string) {
  const base = studioUrl.trim().replace(/\/+$/, '');
  const url = new URL('/api/mcp', base);
  url.searchParams.set('project_ref', projectRef);
  return url.toString();
}

export async function ensureIndobaseMcpFromRequest(
  request: Request,
  mcpService: MCPService,
  env?: ServerEnv,
): Promise<void> {
  const claims = await resolveBuilderMcpClaims(request, env);

  if (!claims?.studio_url || !claims.project_ref) {
    return;
  }

  const cookies = parseCookies(request.headers.get('Cookie'));
  const mcpToken = await resolveValidBuilderMcpToken(
    [readBearerToken(request), cookies[BUILDER_MCP_COOKIE]],
    env,
  );

  if (!mcpToken) {
    return;
  }

  const url = buildIndobaseMcpUrl(claims.studio_url, claims.project_ref);
  const existing = mcpService.getServer(INDOBASE_MCP_SERVER_NAME);
  const existingConfig = existing?.config;
  const existingUrl =
    existingConfig && 'url' in existingConfig ? existingConfig.url : undefined;
  const existingAuth =
    existingConfig && 'headers' in existingConfig ? existingConfig.headers?.Authorization : undefined;
  const sameEndpoint = existingUrl === url && existingAuth === `Bearer ${mcpToken}`;
  const toolsReady =
    Object.keys(mcpService.toolsWithoutExecute).length > 0 && existing?.status === 'available';

  // Reuse a healthy client for the same project/token; otherwise reconnect.
  if (sameEndpoint && toolsReady) {
    return;
  }

  const config: MCPConfig = {
    mcpServers: {
      [INDOBASE_MCP_SERVER_NAME]: {
        type: 'streamable-http',
        url,
        headers: {
          Authorization: `Bearer ${mcpToken}`,
        },
      },
    },
  };

  await mcpService.updateConfig(config);
}
