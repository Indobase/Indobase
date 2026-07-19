import type { IndobaseBackendProject, IndobaseConnectionState } from '~/lib/stores/indobase-connection';

const DEFAULT_STUDIO_URL = 'https://studio.indobase.in';

export type BuilderBackendConfigResponse = {
  backend: {
    anon_key: string;
    api_url: string;
    auth_url: string;
    project_name: string;
    project_ref: string;
    project_url: string;
    rest_url: string;
    storage_url: string;
  };
  project_name?: string;
  organization_slug?: string;
  studio_url?: string;
};

export type BuilderSessionLike = {
  email?: string;
  mcpToken?: string;
  organizationSlug?: string;
  projectRef?: string;
  studioUrl?: string;
  sub?: string;
};

/**
 * Rebuild a full Studio-handoff connection from a session + freshly-fetched backend config.
 * Pure — safe to unit test. Returns null when required backend credentials are missing.
 */
export function buildConnectionFromSessionAndBackend(
  session: BuilderSessionLike,
  data: BuilderBackendConfigResponse,
): Partial<IndobaseConnectionState> | null {
  const projectRef = session.projectRef || data.backend?.project_ref;

  if (!projectRef || !data.backend?.anon_key || !data.backend?.api_url) {
    return null;
  }

  const organizationSlug = session.organizationSlug || data.organization_slug || '';
  const project: IndobaseBackendProject = {
    id: projectRef,
    name: data.project_name || data.backend.project_name || projectRef,
    region: 'indobase',
    organization_id: organizationSlug,
    status: 'active',
    created_at: new Date().toISOString(),
  };

  const email = session.email?.trim();
  const sub = session.sub?.trim();

  return {
    isConnected: true,
    connectionSource: 'studio_handoff',
    selectedProjectId: projectRef,
    project,
    stats: { projects: [project], totalProjects: 1 },
    ...(email
      ? {
          user: {
            id: sub || email,
            email,
            role: 'indobase_builder',
            created_at: new Date().toISOString(),
            last_sign_in_at: new Date().toISOString(),
          },
        }
      : {}),
    credentials: {
      anonKey: data.backend.anon_key,
      apiUrl: data.backend.api_url,
    },
    indobase: {
      apiUrl: data.backend.api_url,
      authUrl: data.backend.auth_url,
      mcpToken: session.mcpToken,
      organizationSlug,
      projectRef,
      projectUrl: data.backend.project_url,
      restUrl: data.backend.rest_url,
      storageUrl: data.backend.storage_url,
      studioUrl: session.studioUrl || data.studio_url || DEFAULT_STUDIO_URL,
    },
  };
}
