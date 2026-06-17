import type { SupabaseConnectionState } from '~/lib/stores/supabase';

export type QueueMobileBuildParams = {
  framework?: 'expo' | 'react_native' | 'flutter' | 'other';
  metadata?: Record<string, unknown>;
  profile?: 'production' | 'preview';
  target?: 'android_aab';
};

export type QueueMobileBuildResult = {
  build?: unknown;
  error?: string;
  status?: number;
  success: boolean;
};

type QueueMobileBuildRequest = QueueMobileBuildParams & {
  mcpToken: string;
  projectRef: string;
  studioUrl: string;
};

export function canQueueIndobaseMobileBuild(connection?: SupabaseConnectionState | null): boolean {
  return Boolean(
    connection?.connectionSource === 'studio_handoff' &&
      connection.indobase?.mcpToken &&
      connection.indobase?.studioUrl &&
      (connection.indobase?.projectRef || connection.selectedProjectId),
  );
}

export async function queueIndobaseMobileBuild(
  connection: SupabaseConnectionState,
  params: QueueMobileBuildParams = {},
): Promise<QueueMobileBuildResult> {
  const projectRef = connection.indobase?.projectRef || connection.selectedProjectId;
  const studioUrl = connection.indobase?.studioUrl;
  const mcpToken = connection.indobase?.mcpToken;

  if (!projectRef || !studioUrl || !mcpToken) {
    return {
      success: false,
      error: 'Connect from Indobase Studio to queue Android builds from Builder.',
    };
  }

  const payload: QueueMobileBuildRequest = {
    mcpToken,
    projectRef,
    studioUrl,
    ...params,
  };

  const response = await fetch('/api/indobase/mobile-build', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

  if (!response.ok) {
    return {
      success: false,
      error: data.error || data.message || 'Failed to queue Android bundle build',
      status: response.status,
    };
  }

  return {
    success: true,
    build: data,
    status: response.status,
  };
}
