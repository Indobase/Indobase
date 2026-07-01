import type { IndobaseConnectionState } from '~/lib/stores/indobase-connection';

export type DeployEnvironmentVariables = Record<string, string>;

function cleanEnvValue(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getDeployEnvironmentVariables(
  connection?: Pick<IndobaseConnectionState, 'credentials' | 'indobase'> | null,
): DeployEnvironmentVariables {
  const supabaseUrl =
    cleanEnvValue(connection?.credentials?.apiUrl) ||
    cleanEnvValue(connection?.credentials?.supabaseUrl) ||
    cleanEnvValue(connection?.indobase?.apiUrl) ||
    cleanEnvValue(connection?.indobase?.projectUrl);
  const anonKey = cleanEnvValue(connection?.credentials?.anonKey);

  if (!supabaseUrl || !anonKey) {
    return {};
  }

  const env: DeployEnvironmentVariables = {
    NEXT_PUBLIC_INDOBASE_ANON_KEY: anonKey,
    NEXT_PUBLIC_INDOBASE_URL: supabaseUrl,
    INDOBASE_ANON_KEY: anonKey,
    INDOBASE_URL: supabaseUrl,
    VITE_INDOBASE_ANON_KEY: anonKey,
    VITE_INDOBASE_URL: supabaseUrl,
    EXPO_PUBLIC_INDOBASE_ANON_KEY: anonKey,
    EXPO_PUBLIC_INDOBASE_URL: supabaseUrl,
    // Legacy aliases for older generated apps
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: anonKey,
    SUPABASE_URL: supabaseUrl,
    VITE_SUPABASE_ANON_KEY: anonKey,
    VITE_SUPABASE_URL: supabaseUrl,
  };

  const projectRef = cleanEnvValue(connection?.indobase?.projectRef);
  const studioUrl = cleanEnvValue(connection?.indobase?.studioUrl);

  if (projectRef) {
    env.INDOBASE_PROJECT_REF = projectRef;
    env.NEXT_PUBLIC_INDOBASE_PROJECT_REF = projectRef;
    env.VITE_INDOBASE_PROJECT_REF = projectRef;
  }

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
