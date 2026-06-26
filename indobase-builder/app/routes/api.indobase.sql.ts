import { json, type ActionFunctionArgs } from '@remix-run/node';

type SqlBody = {
  mcpToken?: string;
  name?: string;
  operation?: 'query' | 'migration';
  projectRef?: string;
  query?: string;
  studioUrl?: string;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  let body: SqlBody;

  try {
    body = (await request.json()) as SqlBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const projectRef = body.projectRef?.trim();
  const studioUrl = body.studioUrl?.trim();
  const mcpToken = body.mcpToken?.trim();
  const query = body.query?.trim();

  if (!projectRef || !studioUrl || !mcpToken || !query) {
    return json({ error: 'projectRef, studioUrl, mcpToken, and query are required' }, { status: 400 });
  }

  const studioEndpoint = new URL(
    `/api/platform/projects/${encodeURIComponent(projectRef)}/sql/builder`,
    studioUrl,
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
};
