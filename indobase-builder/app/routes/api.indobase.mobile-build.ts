import { json, type ActionFunctionArgs } from '@remix-run/node';

type QueueMobileBuildBody = {
  framework?: 'expo' | 'react_native' | 'flutter' | 'other';
  mcpToken?: string;
  metadata?: Record<string, unknown>;
  profile?: 'production' | 'preview';
  projectRef?: string;
  studioUrl?: string;
  target?: 'android_aab';
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  let body: QueueMobileBuildBody;

  try {
    body = (await request.json()) as QueueMobileBuildBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const projectRef = body.projectRef?.trim();
  const studioUrl = body.studioUrl?.trim();
  const mcpToken = body.mcpToken?.trim();

  if (!projectRef || !studioUrl || !mcpToken) {
    return json({ error: 'projectRef, studioUrl, and mcpToken are required' }, { status: 400 });
  }

  const studioEndpoint = new URL(
    `/api/platform/projects/${encodeURIComponent(projectRef)}/mobile-builds/builder`,
    studioUrl,
  );

  const studioResponse = await fetch(studioEndpoint.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${mcpToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      framework: body.framework,
      metadata: body.metadata,
      profile: body.profile,
      target: body.target ?? 'android_aab',
    }),
  });

  const studioPayload = await studioResponse.json().catch(() => ({}));

  return json(studioPayload, { status: studioResponse.status });
};
