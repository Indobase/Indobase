import type { LoaderFunction } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';
import { getApiKeysFromCookie } from '~/lib/api/cookies';

async function exportApiKeysLoader({ request }: { request: Request }) {
  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = getApiKeysFromCookie(cookieHeader);
  return Response.json(apiKeys);
}

export const loader = withSecurity(exportApiKeysLoader, {
  requireAuth: true,
  allowedMethods: ['GET'],
});
