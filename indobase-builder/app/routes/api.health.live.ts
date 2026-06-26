import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';

function resolveVersion(env?: Record<string, string | undefined>) {
  return (
    env?.VITE_GIT_COMMIT?.trim() ||
    env?.BUILD_SHA?.trim() ||
    process.env.VITE_GIT_COMMIT?.trim() ||
    process.env.BUILD_SHA?.trim() ||
    process.env.VITE_APP_VERSION?.trim() ||
    'unknown'
  );
}

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const env = (context as { cloudflare?: { env?: Record<string, string | undefined> } })?.cloudflare?.env;

  return json({
    service: 'indobase-builder',
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: resolveVersion(env),
  });
};
