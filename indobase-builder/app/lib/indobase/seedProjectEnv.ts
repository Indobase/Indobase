import { getDeployEnvironmentVariables } from '~/lib/indobase/deployEnv';
import type { IndobaseConnectionState } from '~/lib/stores/indobase-connection';

export function formatProjectEnvFile(env: Record<string, string>) {
  return `${Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')}\n`;
}

export function buildProjectEnvContent(connection?: IndobaseConnectionState | null) {
  const env = getDeployEnvironmentVariables(connection);

  if (Object.keys(env).length === 0) {
    return null;
  }

  return formatProjectEnvFile(env);
}

export async function seedProjectEnvIfMissing(
  writeFile: (path: string, content: string) => Promise<void>,
  readFile: (path: string) => Promise<string>,
  connection?: IndobaseConnectionState | null,
) {
  const envContent = buildProjectEnvContent(connection);
  if (!envContent) {
    return false;
  }

  try {
    await readFile('.env');
    return false;
  } catch {
    await writeFile('.env', envContent);
    return true;
  }
}
