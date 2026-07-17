import { json, type ActionFunctionArgs } from '@remix-run/node';

import { verifyIndobaseProxyRequest } from '~/lib/indobase/indobase-proxy.server';
import { withSecurity } from '~/lib/security';

type PreflightBody = {
  mcpToken?: string;
  projectRef?: string;
  studioUrl?: string;
};

async function preflightAction({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  let body: PreflightBody;

  try {
    body = (await request.json()) as PreflightBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const env = (context as { cloudflare?: { env?: Record<string, string | undefined> } })?.cloudflare?.env;
  const { mcpToken, projectRef, studioFetchBase } = await verifyIndobaseProxyRequest(request, body, env);

  const studioEndpoint = new URL(
    `/api/platform/projects/${encodeURIComponent(projectRef)}/builder/preflight`,
    studioFetchBase,
  );

  const studioResponse = await fetch(studioEndpoint.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${mcpToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  const studioPayload = await studioResponse.json().catch(() => ({}));

  return json(studioPayload, { status: studioResponse.status });
}

export const action = withSecurity(preflightAction, { requireAuth: true });
