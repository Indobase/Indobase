import type { IndobaseConnectionState } from '~/lib/stores/indobase-connection';
import { hasPocketBaseConnection } from '~/lib/pocketbase/connection';

function resolveApiUrl(connection?: IndobaseConnectionState | null) {
  return connection?.credentials?.apiUrl || connection?.indobase?.apiUrl;
}

/** Studio handoff with backend credentials (env seeding, preview). MCP token may be restored from cookie. */
export function hasIndobaseStudioHandoff(
  connection?: IndobaseConnectionState | null,
): connection is IndobaseConnectionState {
  if (connection?.backendProvider === 'pocketbase' || connection?.connectionSource === 'pocketbase') {
    return false;
  }

  return Boolean(
    connection?.connectionSource === 'studio_handoff' &&
      connection.isConnected &&
      resolveApiUrl(connection) &&
      connection.credentials?.anonKey &&
      connection.indobase?.studioUrl &&
      (connection.indobase?.projectRef || connection.selectedProjectId),
  );
}

/** Studio-linked project selected (handoff may omit stats.projects). */
export function hasSelectedIndobaseProject(connection?: IndobaseConnectionState | null): boolean {
  if (hasPocketBaseConnection(connection)) {
    return true;
  }

  if (!connection?.selectedProjectId && !connection?.indobase?.projectRef) {
    return false;
  }

  const projectId = connection.selectedProjectId || connection.indobase?.projectRef;

  return Boolean(
    connection.stats?.projects?.some((project) => project.id === projectId) ||
      connection.project?.id === projectId ||
      (connection.connectionSource === 'studio_handoff' && projectId),
  );
}

/** Full Studio session including MCP token for deploy, SQL, and chat quota. */
export function isIndobaseStudioManagedConnection(
  connection?: IndobaseConnectionState | null,
): connection is IndobaseConnectionState {
  return hasIndobaseStudioHandoff(connection) && Boolean(connection.indobase?.mcpToken);
}

/** Any linked app backend (Indobase Studio/manual or PocketBase). */
export function isBuilderBackendConnected(connection?: IndobaseConnectionState | null): boolean {
  return hasIndobaseStudioHandoff(connection) || hasPocketBaseConnection(connection) || Boolean(connection?.isConnected);
}
