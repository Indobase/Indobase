import type { SupabaseConnectionState } from '~/lib/stores/supabase';

export function isIndobaseStudioManagedConnection(
  connection?: SupabaseConnectionState | null,
): connection is SupabaseConnectionState {
  return Boolean(
    connection?.connectionSource === 'studio_handoff' &&
      connection.isConnected &&
      connection.indobase?.mcpToken &&
      connection.indobase?.studioUrl &&
      (connection.indobase?.projectRef || connection.selectedProjectId),
  );
}
