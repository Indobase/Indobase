import { json, type ActionFunctionArgs } from '@remix-run/node';

type DeployBody = {
  artifacts?: Record<string, string>;
  deploymentId?: string;
  mcpToken?: string;
  metadata?: Record<string, unknown>;
  projectRef?: string;
  studioUrl?: string;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  let body: DeployBody;

  try {
    body = (await request.json()) as DeployBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const projectRef = body.projectRef?.trim();
  const studioUrl = body.studioUrl?.trim();
  const mcpToken = body.mcpToken?.trim();
  const deploymentId = body.deploymentId?.trim();

  if (!projectRef || !studioUrl || !mcpToken) {
    return json({ error: 'projectRef, studioUrl, and mcpToken are required' }, { status: 400 });
  }

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
};
