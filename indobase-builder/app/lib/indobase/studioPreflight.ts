import { getBuilderRequestInit } from '~/lib/indobase/builder-auth.client';
import type { SupabaseConnectionState } from '~/lib/stores/supabase';
import { hasIndobaseStudioHandoff } from './connection';

export type StudioPreflightResult = {
  dataPlane?: {
    action?: string;
    reachable?: boolean;
    repaired?: boolean;
  };
  error?: string;
  projectStatus?: string;
  ready?: boolean;
  status?: number;
  success: boolean;
};

export async function runStudioBackendPreflight(
  connection: SupabaseConnectionState,
): Promise<StudioPreflightResult> {
  if (!hasIndobaseStudioHandoff(connection)) {
    return {
      success: false,
      error: 'Connect from Indobase Studio to use your project backend.',
      status: 401,
    };
  }

  const projectRef = connection.indobase?.projectRef || connection.selectedProjectId;
  const studioUrl = connection.indobase?.studioUrl;

  if (!projectRef || !studioUrl) {
    return {
      success: false,
      error: 'Missing Studio project link. Reconnect from Studio.',
      status: 400,
    };
  }

  const response = await fetch(
    '/api/indobase/preflight',
    getBuilderRequestInit({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mcpToken: connection.indobase?.mcpToken,
        projectRef,
        studioUrl,
      }),
    }),
  );

  const data = (await response.json().catch(() => ({}))) as StudioPreflightResult & {
    message?: string;
  };

  if (!response.ok) {
    return {
      success: false,
      error: data.error || data.message || 'Backend preflight failed',
      status: response.status,
      projectStatus: data.projectStatus,
      dataPlane: data.dataPlane,
    };
  }

  return {
    success: Boolean(data.ready ?? data.success),
    ready: Boolean(data.ready),
    projectStatus: data.projectStatus,
    dataPlane: data.dataPlane,
    status: response.status,
  };
}
