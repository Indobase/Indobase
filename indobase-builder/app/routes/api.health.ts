import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';

export const loader = async ({ request: _request }: LoaderFunctionArgs) => {
  return json({
    service: 'indobase-builder',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version:
      process.env.VITE_GIT_COMMIT?.trim() ||
      process.env.BUILD_SHA?.trim() ||
      process.env.VITE_APP_VERSION?.trim() ||
      'unknown',
  });
};
