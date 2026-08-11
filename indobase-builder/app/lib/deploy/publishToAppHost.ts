import { getBuilderRequestInit } from '~/lib/indobase/builder-auth.client';
import type { IndobaseConnectionState } from '~/lib/stores/indobase-connection';
import { hasPocketBaseConnection } from '~/lib/pocketbase/connection';
import { runDeployBuildStep } from '~/lib/deploy/runDeployBuild';

export type PublishToAppHostResult = {
  success: boolean;
  error?: string;
  status?: number;
  openedUrl?: string;
  slug?: string;
};

function slugFromConnection(connection: IndobaseConnectionState, fallback?: string) {
  const fromApp = connection.pocketbase?.appId?.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const fromFallback = fallback?.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const slug = (fromApp || fromFallback || `app-${Date.now().toString(36)}`).replace(/-+/g, '-').slice(0, 48);
  return slug.replace(/^-|-$/g, '') || `app-${Date.now().toString(36)}`;
}

/**
 * Publish a managed-backend Builder app to the app-host VPS (ex data-plane).
 * Does not require Indobase Studio or tenant data planes.
 */
export async function publishToAppHost(
  connection: IndobaseConnectionState,
  options: { slug?: string; metadata?: Record<string, unknown> } = {},
): Promise<PublishToAppHostResult> {
  if (!hasPocketBaseConnection(connection)) {
    return {
      success: false,
      error: 'Indobase backend is required to publish.',
      status: 400,
    };
  }

  const buildResult = await runDeployBuildStep(connection);

  if (!buildResult.success || !buildResult.files) {
    return {
      success: false,
      error: buildResult.error || 'Build failed before publish.',
    };
  }

  const slug = slugFromConnection(connection, options.slug);
  const response = await fetch(
    '/api/pocketbase/publish',
    getBuilderRequestInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug,
        files: buildResult.files,
        metadata: options.metadata ?? { source: 'pocketbase_app_host' },
        appId: connection.pocketbase?.appId,
        pocketbaseUrl: connection.pocketbase?.url,
      }),
    }),
  );

  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    url?: string;
    slug?: string;
    message?: string;
  };

  if (!response.ok || !data.ok) {
    return {
      success: false,
      error: data.message || 'App host publish failed',
      status: response.status,
    };
  }

  return {
    success: true,
    openedUrl: data.url,
    slug: data.slug || slug,
    status: response.status,
  };
}
