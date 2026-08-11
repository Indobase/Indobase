import { getBuilderRequestInit } from '~/lib/indobase/builder-auth.client';
import { hasIndobaseStudioHandoff } from '~/lib/indobase/connection';
import { hasPocketBaseConnection } from '~/lib/pocketbase/connection';
import { indobaseConnection, updateIndobaseConnection } from '~/lib/stores/indobase-connection';

export type EnsureManagedPocketBaseClientResult =
  | { ok: true; url: string; appId: string; alreadyLinked?: boolean }
  | { ok: false; message: string; configured?: boolean };

/**
 * Silently attach the managed Indobase backend for Builder sessions.
 * Studio / legacy data-plane is not required for this product path.
 */
export async function ensureManagedPocketBaseForChat(options?: {
  seed?: string;
  force?: boolean;
}): Promise<EnsureManagedPocketBaseClientResult> {
  const current = indobaseConnection.get();

  // Legacy Studio handoff only wins when caller did not force the managed backend path.
  if (!options?.force && hasIndobaseStudioHandoff(current)) {
    return { ok: false, message: 'Studio Indobase backend is already linked' };
  }

  if (!options?.force && hasPocketBaseConnection(current) && current.pocketbase?.url && current.pocketbase?.appId) {
    return {
      ok: true,
      url: current.pocketbase.url,
      appId: current.pocketbase.appId,
      alreadyLinked: true,
    };
  }

  if (
    options?.force &&
    hasPocketBaseConnection(current) &&
    current.pocketbase?.url &&
    current.pocketbase?.appId
  ) {
    return {
      ok: true,
      url: current.pocketbase.url,
      appId: current.pocketbase.appId,
      alreadyLinked: true,
    };
  }

  const response = await fetch(
    '/api/pocketbase/ensure',
    getBuilderRequestInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appId: current.pocketbase?.appId,
        seed: options?.seed,
      }),
    }),
  );

  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    url?: string;
    appId?: string;
    message?: string;
    configured?: boolean;
  };

  if (!response.ok || !data.ok || !data.url || !data.appId) {
    return {
      ok: false,
      configured: data.configured,
      message: data.message || 'Could not provision Indobase backend',
    };
  }

  updateIndobaseConnection({
    backendProvider: 'pocketbase',
    connectionSource: 'pocketbase',
    pocketbase: { url: data.url, appId: data.appId },
    selectedProjectId: data.appId,
    credentials: undefined,
    indobase: undefined,
    user: {
      id: data.appId,
      email: 'Indobase backend',
      role: 'indobase_backend',
      created_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
    },
    project: {
      id: data.appId,
      name: 'Indobase backend',
      region: 'indobase',
      organization_id: '',
      status: 'active',
      created_at: new Date().toISOString(),
    },
    stats: {
      projects: [
        {
          id: data.appId,
          name: 'Indobase backend',
          region: 'indobase',
          organization_id: '',
          status: 'active',
          created_at: new Date().toISOString(),
        },
      ],
      totalProjects: 1,
    },
  });

  return { ok: true, url: data.url, appId: data.appId };
}
