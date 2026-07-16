import { json, type ActionFunctionArgs } from '@remix-run/node';

import { verifyIndobaseProxyRequest } from '~/lib/indobase/indobase-proxy.server';
import { withSecurity } from '~/lib/security';

type BackendBody = {
  mcpToken?: string;
  projectRef?: string;
  studioUrl?: string;
};

async function backendAction({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  let body: BackendBody;

  try {
    body = (await request.json()) as BackendBody;
  } catch {
    body = {};
  }

  const env = (context as { cloudflare?: { env?: Record<string, string | undefined> } })?.cloudflare?.env;
  const { mcpToken, projectRef, studioUrl } = await verifyIndobaseProxyRequest(request, body, env);

  const studioEndpoint = new URL(`/api/platform/projects/${encodeURIComponent(projectRef)}/builder/backend`, studioUrl);

  const studioResponse = await fetch(studioEndpoint.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${mcpToken}`,
      Accept: 'application/json',
    },
  });

  const studioPayload = await studioResponse.json().catch(() => ({}));

  return json(studioPayload, { status: studioResponse.status });
}

export const action = withSecurity(backendAction, { requireAuth: true });
