import type { SupabaseConnectionState } from '~/lib/stores/supabase';

/** Studio handoff with backend credentials (env seeding, preview). MCP token may be restored from cookie. */
export function hasIndobaseStudioHandoff(
  connection?: SupabaseConnectionState | null,
): connection is SupabaseConnectionState {
  return Boolean(
    connection?.connectionSource === 'studio_handoff' &&
      connection.isConnected &&
      connection.credentials?.supabaseUrl &&
      connection.credentials?.anonKey &&
      connection.indobase?.studioUrl &&
      (connection.indobase?.projectRef || connection.selectedProjectId),
  );
}

/** Full Studio session including MCP token for deploy, SQL, and chat quota. */
export function isIndobaseStudioManagedConnection(
  connection?: SupabaseConnectionState | null,
): connection is SupabaseConnectionState {
  return hasIndobaseStudioHandoff(connection) && Boolean(connection.indobase?.mcpToken);
}
