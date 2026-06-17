import type { MCPConfig } from '~/lib/services/mcpService';
import type { SupabaseConnectionState } from '~/lib/stores/supabase';

export const INDOBASE_MCP_SERVER_NAME = 'indobase';

function buildIndobaseMcpUrl(studioUrl: string, projectRef: string) {
  const url = new URL('/mcp', studioUrl);
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

  if (autoConfig?.mcpServers?.[INDOBASE_MCP_SERVER_NAME]) {
    mergedServers[INDOBASE_MCP_SERVER_NAME] = autoConfig.mcpServers[INDOBASE_MCP_SERVER_NAME];
  } else {
    delete mergedServers[INDOBASE_MCP_SERVER_NAME];
  }

  return {
    mcpServers: mergedServers,
  };
}
