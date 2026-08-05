import { json, type ActionFunctionArgs } from '@remix-run/node';

import {
  sandboxPreviewPublicUrl,
  startSandboxPreview,
} from '~/lib/indobase/live-preview-sandbox.server';
import { withSecurity } from '~/lib/security';

type SandboxPreviewBody = {
  files?: Record<string, string>;
  /** Workspace snapshot the frozen files were materialized from (observability). */
  snapshotId?: string;
};

async function sandboxPreviewAction({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  let body: SandboxPreviewBody;

  try {
    body = (await request.json()) as SandboxPreviewBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.files || Object.keys(body.files).length === 0) {
    return json({ success: false, error: 'No project files provided' }, { status: 400 });
  }

  // Intentionally ignore any client `env` — hosted builds use scrubbed child env only.
  const result = await startSandboxPreview(body.files, {
    snapshotId: typeof body.snapshotId === 'string' ? body.snapshotId : undefined,
  });

  if (!result.success) {
    return json({ success: false, error: result.error }, { status: 422 });
  }

  const origin = new URL(request.url).origin;

  return json({
    success: true,
    id: result.id,
    previewUrl: sandboxPreviewPublicUrl(result.id, origin),
    expiresAt: result.expiresAt,
    hasViteProxy: result.hasViteProxy,
    snapshotId: result.snapshotId,
    backend: 'hosted',
  });
}

export const action = withSecurity(sandboxPreviewAction, { requireAuth: true });
