import { Platform } from '@indobase/platform';
import type { IndobaseConnectionState } from '~/lib/stores/indobase-connection';

export type DeployEnvironmentVariables = Record<string, string>;

function cleanEnvValue(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function getPocketBaseEnvironmentVariables(
  connection?: Pick<IndobaseConnectionState, 'backendProvider' | 'connectionSource' | 'pocketbase'> | null,
): DeployEnvironmentVariables {
  const isPocketBase =
    connection?.backendProvider === 'pocketbase' || connection?.connectionSource === 'pocketbase';
  const url = cleanEnvValue(connection?.pocketbase?.url);

  if (!isPocketBase || !url) {
    return {};
  }

  // Public env for generated apps — Indobase brand only (never PocketBase names).
  return {
    INDOBASE_URL: url,
    VITE_INDOBASE_URL: url,
    NEXT_PUBLIC_INDOBASE_URL: url,
    EXPO_PUBLIC_INDOBASE_URL: url,
  };
}

/**
 * Deploy / codegen env for a linked project.
 * Auth URL + anon key bindings come from the Platform Runtime ABI (`auth` capability),
 * not from hard-coded product knowledge.
 *
 * Studio URL is a Builder deploy helper only — never part of ProjectRuntime ABI.
 */
export function getDeployEnvironmentVariables(
  connection?: Pick<
    IndobaseConnectionState,
    'credentials' | 'indobase' | 'backendProvider' | 'connectionSource' | 'pocketbase'
  > | null,
): DeployEnvironmentVariables {
  const pocketbaseEnv = getPocketBaseEnvironmentVariables(connection);
  if (Object.keys(pocketbaseEnv).length > 0) {
    return pocketbaseEnv;
  }

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

  // Non-ABI: product control-plane hint for generated apps — outside Platform.resolve.
  const studioUrl = cleanEnvValue(connection?.indobase?.studioUrl);
  if (studioUrl) {
    env.INDOBASE_STUDIO_URL = studioUrl;
    env.NEXT_PUBLIC_INDOBASE_STUDIO_URL = studioUrl;
    env.VITE_INDOBASE_STUDIO_URL = studioUrl;
  }

  return env;
}

export function hasDeployEnvironmentVariables(
  connection?: Pick<
    IndobaseConnectionState,
    'credentials' | 'indobase' | 'backendProvider' | 'connectionSource' | 'pocketbase'
  > | null,
): boolean {
  return Object.keys(getDeployEnvironmentVariables(connection)).length > 0;
}
