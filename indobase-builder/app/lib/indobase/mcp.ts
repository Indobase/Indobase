import type { MCPConfig } from '~/lib/services/mcpService';
import type { IndobaseConnectionState } from '~/lib/stores/indobase-connection';
import { readStoredConnectionRaw } from '~/lib/indobase/connection-storage';

export const INDOBASE_MCP_SERVER_NAME = 'indobase';
export const INDOBASE_PAYMENTS_MCP_SERVER_NAME = 'indobase-payments';

function buildIndobaseMcpUrl(studioUrl: string, projectRef: string) {
  const base = studioUrl.trim().replace(/\/+$/, '');
  const url = new URL('/api/mcp', base);

  if (url.pathname.endsWith('/mcp') && !url.pathname.includes('/api/mcp')) {
    url.pathname = '/api/mcp';
  }

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

export function getStoredIndobaseConnection(): IndobaseConnectionState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = readStoredConnectionRaw();

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as IndobaseConnectionState;
  } catch (error) {
    console.error('Failed to parse stored Indobase connection for MCP sync:', error);
    return null;
  }
}

export function getAutoIndobaseMcpConfig(connection?: IndobaseConnectionState | null): MCPConfig | null {
  const resolvedConnection = connection ?? getStoredIndobaseConnection();

  if (
    !resolvedConnection ||
    resolvedConnection.connectionSource !== 'studio_handoff' ||
    !resolvedConnection.indobase?.studioUrl ||
    !resolvedConnection.indobase?.projectRef ||
    !resolvedConnection.indobase?.mcpToken
  ) {
    return null;
  }

  const studioUrl = resolvedConnection.indobase.studioUrl;
  const projectRef = resolvedConnection.indobase.projectRef;
  const authHeaders = {
    Authorization: `Bearer ${resolvedConnection.indobase.mcpToken}`,
  };

  return {
    mcpServers: {
      [INDOBASE_MCP_SERVER_NAME]: {
        type: 'streamable-http',
        url: buildIndobaseMcpUrl(studioUrl, projectRef),
        headers: authHeaders,
      },
      [INDOBASE_PAYMENTS_MCP_SERVER_NAME]: {
        type: 'streamable-http',
        url: buildIndobasePaymentsMcpUrl(studioUrl, projectRef),
        headers: authHeaders,
      },
    },
  };
}

export function mergeMcpConfigWithIndobase(
  baseConfig: MCPConfig,
  connection?: IndobaseConnectionState | null,
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

  if (autoConfig?.mcpServers?.[INDOBASE_PAYMENTS_MCP_SERVER_NAME]) {
    mergedServers[INDOBASE_PAYMENTS_MCP_SERVER_NAME] =
      autoConfig.mcpServers[INDOBASE_PAYMENTS_MCP_SERVER_NAME];
  } else {
    delete mergedServers[INDOBASE_PAYMENTS_MCP_SERVER_NAME];
  }

  return {
    mcpServers: mergedServers,
  };
}
