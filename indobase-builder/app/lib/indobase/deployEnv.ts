import { Platform } from '@indobase/platform';
import type { IndobaseConnectionState } from '~/lib/stores/indobase-connection';

export type DeployEnvironmentVariables = Record<string, string>;

function cleanEnvValue(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Deploy / codegen env for a linked project.
 * Auth URL + anon key bindings come from the Platform Runtime ABI (`auth` capability),
 * not from hard-coded product knowledge.
 */
export function getDeployEnvironmentVariables(
  connection?: Pick<IndobaseConnectionState, 'credentials' | 'indobase'> | null,
): DeployEnvironmentVariables {
  const apiUrl =
    cleanEnvValue(connection?.credentials?.apiUrl) ||
    cleanEnvValue(connection?.indobase?.apiUrl) ||
    cleanEnvValue(connection?.indobase?.projectUrl);
  const anonKey = cleanEnvValue(connection?.credentials?.anonKey);

  if (!apiUrl || !anonKey) {
    return {};
  }

  const projectRef = cleanEnvValue(connection?.indobase?.projectRef) || 'unknown';
  const runtime = Platform.resolve({
    projectRef,
    dataPlane: { url: apiUrl, anonKey },
  });

  const env: DeployEnvironmentVariables = {
    ...(runtime.capabilities.auth?.bindings.env ?? {}),
  };

  if (projectRef !== 'unknown') {
    env.INDOBASE_PROJECT_REF = projectRef;
    env.NEXT_PUBLIC_INDOBASE_PROJECT_REF = projectRef;
    env.VITE_INDOBASE_PROJECT_REF = projectRef;
  }

  const studioUrl = cleanEnvValue(connection?.indobase?.studioUrl);
  if (studioUrl) {
    env.INDOBASE_STUDIO_URL = studioUrl;
    env.NEXT_PUBLIC_INDOBASE_STUDIO_URL = studioUrl;
    env.VITE_INDOBASE_STUDIO_URL = studioUrl;
  }

  return env;
}

export function hasDeployEnvironmentVariables(
  connection?: Pick<IndobaseConnectionState, 'credentials' | 'indobase'> | null,
): boolean {
  return Object.keys(getDeployEnvironmentVariables(connection)).length > 0;
}
