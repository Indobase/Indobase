import { parseCookies } from '~/lib/api/cookies';
import { readBearerToken, resolveValidBuilderMcpToken } from '~/lib/indobase/builder-auth.server';
import { resolveBuilderMcpClaims } from '~/lib/indobase/builder-prompt-quota.server';
import { BUILDER_MCP_COOKIE } from '~/lib/indobase/builder-session.constants';
import {
  INDOBASE_MCP_SERVER_NAME,
  INDOBASE_PAYMENTS_MCP_SERVER_NAME,
} from '~/lib/indobase/mcp';
import { resolveStudioServerFetchBase } from '~/lib/indobase/studio-server-url.server';
import type { MCPConfig } from '~/lib/services/mcpService';
import type { MCPService } from '~/lib/services/mcpService';

type ServerEnv = Record<string, string | undefined>;

function buildIndobaseMcpUrl(studioUrl: string, projectRef: string) {
  const base = studioUrl.trim().replace(/\/+$/, '');
  const url = new URL('/api/mcp', base);
  url.searchParams.set('project_ref', projectRef);
  // Self-hosted Studio has no Content API for docs tools; exclude docs so MCP init succeeds.
  url.searchParams.set('features', 'database,development,debugging');
  return url.toString();
}

function buildIndobasePaymentsMcpUrl(studioUrl: string, projectRef: string) {
  const base = studioUrl.trim().replace(/\/+$/, '');
  const url = new URL('/api/mcp/payments', base);
  url.searchParams.set('project_ref', projectRef);
  return url.toString();
}

function sameServerEndpoint(
  mcpService: MCPService,
  name: string,
  url: string,
  mcpToken: string,
): boolean {
  const existing = mcpService.getServer(name);
  const existingConfig = existing?.config;
  const existingUrl =
    existingConfig && 'url' in existingConfig ? existingConfig.url : undefined;
  const existingAuth =
    existingConfig && 'headers' in existingConfig ? existingConfig.headers?.Authorization : undefined;
  return existingUrl === url && existingAuth === `Bearer ${mcpToken}` && existing?.status === 'available';
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

  const studioFetchBase = resolveStudioServerFetchBase(claims.studio_url, env);

  if (!studioFetchBase) {
    return;
  }

  const indobaseUrl = buildIndobaseMcpUrl(studioFetchBase, claims.project_ref);
  const paymentsUrl = buildIndobasePaymentsMcpUrl(studioFetchBase, claims.project_ref);
  const toolsReady = Object.keys(mcpService.toolsWithoutExecute).length > 0;
  const sameIndobase = sameServerEndpoint(mcpService, INDOBASE_MCP_SERVER_NAME, indobaseUrl, mcpToken);
  const samePayments = sameServerEndpoint(
    mcpService,
    INDOBASE_PAYMENTS_MCP_SERVER_NAME,
    paymentsUrl,
    mcpToken,
  );

  // Reuse healthy clients for the same project/token; otherwise reconnect both.
  if (sameIndobase && samePayments && toolsReady) {
    return;
  }

  const config: MCPConfig = {
    mcpServers: {
      [INDOBASE_MCP_SERVER_NAME]: {
        type: 'streamable-http',
        url: indobaseUrl,
        headers: {
          Authorization: `Bearer ${mcpToken}`,
        },
      },
      [INDOBASE_PAYMENTS_MCP_SERVER_NAME]: {
        type: 'streamable-http',
        url: paymentsUrl,
        headers: {
          Authorization: `Bearer ${mcpToken}`,
        },
      },
    },
  };

  await mcpService.updateConfig(config);
}
