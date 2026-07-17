import { json, type ActionFunctionArgs } from '@remix-run/node';

import { verifyIndobaseProxyRequest } from '~/lib/indobase/indobase-proxy.server';
import { withSecurity } from '~/lib/security';

type SqlBody = {
  mcpToken?: string;
  name?: string;
  operation?: 'query' | 'migration';
  projectRef?: string;
  query?: string;
  studioUrl?: string;
};

async function sqlAction({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  let body: SqlBody;

  try {
    body = (await request.json()) as SqlBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const query = body.query?.trim();

  if (!query) {
    return json({ error: 'query is required' }, { status: 400 });
  }

  const env = (context as { cloudflare?: { env?: Record<string, string | undefined> } })?.cloudflare?.env;
  const { mcpToken, projectRef, studioFetchBase } = await verifyIndobaseProxyRequest(request, body, env);

  const studioEndpoint = new URL(
    `/api/platform/projects/${encodeURIComponent(projectRef)}/sql/builder`,
    studioFetchBase,
  );

  const studioResponse = await fetch(studioEndpoint.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${mcpToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      operation: body.operation ?? 'query',
      name: body.name,
    }),
  });

  const studioPayload = await studioResponse.json().catch(() => ({}));

  return json(studioPayload, { status: studioResponse.status });
}

export const action = withSecurity(sqlAction, { requireAuth: true });
