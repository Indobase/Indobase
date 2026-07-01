import type { MCPConfig } from '~/lib/services/mcpService';
import type { SupabaseConnectionState } from '~/lib/stores/supabase';

export const INDOBASE_MCP_SERVER_NAME = 'indobase';

function buildIndobaseMcpUrl(studioUrl: string, projectRef: string) {
  const base = studioUrl.trim().replace(/\/+$/, '');
  const url = new URL('/api/mcp', base);

  // Legacy handoffs or saved MCP configs may still point at /mcp — normalize to the Studio API route.
  if (url.pathname.endsWith('/mcp') && !url.pathname.includes('/api/mcp')) {
    url.pathname = '/api/mcp';
  }

  url.searchParams.set('project_ref', projectRef);

  return url.toString();
}

export function getStoredSupabaseConnection(): SupabaseConnectionState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem('supabase_connection');

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SupabaseConnectionState;
  } catch (error) {
    console.error('Failed to parse stored Indobase connection for MCP sync:', error);
    return null;
  }
}

export function getAutoIndobaseMcpConfig(connection?: SupabaseConnectionState | null): MCPConfig | null {
  const resolvedConnection = connection ?? getStoredSupabaseConnection();

  if (
    !resolvedConnection ||
    resolvedConnection.connectionSource !== 'studio_handoff' ||
    !resolvedConnection.indobase?.studioUrl ||
    !resolvedConnection.indobase?.projectRef ||
    !resolvedConnection.indobase?.mcpToken
  ) {
    return null;
  }

  return {
    mcpServers: {
      [INDOBASE_MCP_SERVER_NAME]: {
        type: 'streamable-http',
        url: buildIndobaseMcpUrl(resolvedConnection.indobase.studioUrl, resolvedConnection.indobase.projectRef),
        headers: {
          Authorization: `Bearer ${resolvedConnection.indobase.mcpToken}`,
        },
      },
    },
  };
}

export function mergeMcpConfigWithIndobase(
  baseConfig: MCPConfig,
  connection?: SupabaseConnectionState | null,
): MCPConfig {
  const mergedServers = {
    ...(baseConfig.mcpServers || {}),
  };
  const autoConfig = getAutoIndobaseMcpConfig(connection);
  const legacyIndobase = mergedServers[INDOBASE_MCP_SERVER_NAME];

  if (autoConfig?.mcpServers?.[INDOBASE_MCP_SERVER_NAME]) {
    mergedServers[INDOBASE_MCP_SERVER_NAME] = autoConfig.mcpServers[INDOBASE_MCP_SERVER_NAME];
  } else {
    delete mergedServers[INDOBASE_MCP_SERVER_NAME];

    if (
      legacyIndobase &&
      'url' in legacyIndobase &&
      typeof legacyIndobase.url === 'string' &&
      legacyIndobase.url.includes('/mcp') &&
      !legacyIndobase.url.includes('/api/mcp') &&
      connection?.indobase?.studioUrl &&
      connection?.indobase?.projectRef
    ) {
      mergedServers[INDOBASE_MCP_SERVER_NAME] = {
        ...legacyIndobase,
        type: 'streamable-http',
        url: buildIndobaseMcpUrl(connection.indobase.studioUrl, connection.indobase.projectRef),
      };
    }
  }

  return {
    mcpServers: mergedServers,
  };
}
