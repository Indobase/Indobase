import { json, type ActionFunctionArgs } from '@remix-run/node';

import { verifyIndobaseProxyRequest } from '~/lib/indobase/indobase-proxy.server';
import { withSecurity } from '~/lib/security';

type DeployBody = {
  artifacts?: Record<string, string>;
  deploymentId?: string;
  mcpToken?: string;
  metadata?: Record<string, unknown>;
  projectRef?: string;
  studioUrl?: string;
};

async function deployAction({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  let body: DeployBody;

  try {
    body = (await request.json()) as DeployBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const env = (context as { cloudflare?: { env?: Record<string, string | undefined> } })?.cloudflare?.env;
  const { mcpToken, projectRef, studioUrl } = await verifyIndobaseProxyRequest(request, body, env);
  const deploymentId = body.deploymentId?.trim();

  const studioPath = deploymentId
    ? `/api/platform/projects/${encodeURIComponent(projectRef)}/deployments/builder/${encodeURIComponent(deploymentId)}`
    : `/api/platform/projects/${encodeURIComponent(projectRef)}/deployments/builder`;

  const studioEndpoint = new URL(studioPath, studioUrl);

  const studioResponse = await fetch(studioEndpoint.toString(), {
    method: deploymentId ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${mcpToken}`,
      'Content-Type': 'application/json',
    },
    ...(deploymentId
      ? {}
      : {
          body: JSON.stringify({
            artifacts: body.artifacts,
            metadata: body.metadata,
          }),
        }),
  });

  const studioPayload = await studioResponse.json().catch(() => ({}));

  return json(studioPayload, { status: studioResponse.status });
}

export const action = withSecurity(deployAction, { requireAuth: true });
