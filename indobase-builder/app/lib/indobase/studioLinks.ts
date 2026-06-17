import type { SupabaseConnectionState } from '~/lib/stores/supabase';

type IndobaseConnection = Pick<SupabaseConnectionState, 'indobase'>;

export function getStudioProjectRootUrl(connection?: IndobaseConnection | null, projectId?: string): string | null {
  if (connection?.indobase?.projectUrl) {
    return connection.indobase.projectUrl.replace(/\/backend\/?$/, '');
  }

  if (connection?.indobase?.studioUrl && projectId) {
    return `${connection.indobase.studioUrl.replace(/\/$/, '')}/project/${projectId}`;
  }

  return null;
}

export function getStudioProjectGeneralSettingsUrl(
  connection?: IndobaseConnection | null,
  projectId?: string,
): string | null {
  const rootUrl = getStudioProjectRootUrl(connection, projectId);

  if (!rootUrl) {
    return null;
  }

  return `${rootUrl.replace(/\/$/, '')}/settings/general`;
}

export function getStudioProjectHostingUrl(connection?: IndobaseConnection | null, projectId?: string): string | null {
  const settingsUrl = getStudioProjectGeneralSettingsUrl(connection, projectId);

  if (!settingsUrl) {
    return null;
  }

  return `${settingsUrl}#hosting`;
}

export function getStudioProjectCustomDomainsUrl(
  connection?: IndobaseConnection | null,
  projectId?: string,
): string | null {
  const settingsUrl = getStudioProjectGeneralSettingsUrl(connection, projectId);

  if (!settingsUrl) {
    return null;
  }

  return `${settingsUrl}#custom-domains`;
}

export function getStudioProjectMobileBuildsUrl(
  connection?: IndobaseConnection | null,
  projectId?: string,
): string | null {
  const settingsUrl = getStudioProjectGeneralSettingsUrl(connection, projectId);

  if (!settingsUrl) {
    return null;
  }

  return `${settingsUrl}#mobile-builds`;
}
