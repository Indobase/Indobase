import type { IndobaseBuilderHandoffPayload } from '~/types/indobase';
import type { IndobaseConnectionState, IndobaseBackendProject } from '~/lib/stores/indobase-connection';

export function buildIndobaseProjectFromHandoff(payload: IndobaseBuilderHandoffPayload): IndobaseBackendProject {
  return {
    id: payload.project_ref,
    name: payload.project_name,
    region: 'indobase',
    organization_id: payload.organization_slug,
    status: 'active',
    created_at: new Date(payload.iat * 1000).toISOString(),
  };
}

export function buildIndobaseConnectionFromHandoff(
  payload: IndobaseBuilderHandoffPayload,
  options?: {
    mcpToken?: string;
  },
): Partial<IndobaseConnectionState> {
  const project = buildIndobaseProjectFromHandoff(payload);

  return {
    user: {
      id: payload.sub,
      email: payload.email,
      role: 'indobase_builder',
      created_at: new Date(payload.iat * 1000).toISOString(),
      last_sign_in_at: new Date().toISOString(),
    },
    token: '',
    stats: {
      projects: [project],
      totalProjects: 1,
    },
    selectedProjectId: payload.project_ref,
    isConnected: true,
    project,
    credentials: {
      anonKey: payload.backend.anon_key,
      apiUrl: payload.backend.api_url,
    },
    connectionSource: 'studio_handoff',
    indobase: {
      apiUrl: payload.backend.api_url,
      authUrl: payload.backend.auth_url,
      mcpToken: options?.mcpToken,
      organizationSlug: payload.organization_slug,
      projectRef: payload.project_ref,
      projectUrl: payload.backend.project_url,
      restUrl: payload.backend.rest_url,
      storageUrl: payload.backend.storage_url,
      studioUrl: payload.studio_url,
    },
  };
}
