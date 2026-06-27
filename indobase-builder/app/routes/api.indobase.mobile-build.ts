import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';

import { verifyIndobaseProxyRequest } from '~/lib/indobase/indobase-proxy.server';
import { withSecurity } from '~/lib/security';

type QueueMobileBuildBody = {
  framework?: 'expo' | 'react_native' | 'flutter' | 'other';
  mcpToken?: string;
  metadata?: Record<string, unknown>;
  profile?: 'production' | 'preview';
  projectRef?: string;
  sourceFiles?: Record<string, string>;
  studioUrl?: string;
  target?: 'android_aab';
};

async function mobileBuildAction({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  let body: QueueMobileBuildBody;

  try {
    body = (await request.json()) as QueueMobileBuildBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const env = (context as { cloudflare?: { env?: Record<string, string | undefined> } })?.cloudflare?.env;
  const { mcpToken, projectRef, studioUrl } = await verifyIndobaseProxyRequest(request, body, env);

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
      sourceFiles: body.sourceFiles,
      target: body.target ?? 'android_aab',
    }),
  });

  const studioPayload = await studioResponse.json().catch(() => ({}));

  return json(studioPayload, { status: studioResponse.status });
}

export const action = withSecurity(mobileBuildAction, { requireAuth: true });
