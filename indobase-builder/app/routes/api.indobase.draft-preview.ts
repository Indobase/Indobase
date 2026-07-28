import { json, type ActionFunctionArgs } from '@remix-run/node';

import { draftPreviewPublicUrl, storeDraftPreview } from '~/lib/indobase/draft-preview.server';
import { withSecurity } from '~/lib/security';

type DraftPreviewBody = {
  files?: Record<string, string>;
};

async function draftPreviewAction({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  let body: DraftPreviewBody;

  try {
    body = (await request.json()) as DraftPreviewBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.files || Object.keys(body.files).length === 0) {
    return json({ success: false, error: 'No build artifacts provided' }, { status: 400 });
  }

  try {
    const draft = storeDraftPreview(body.files);
    const origin = new URL(request.url).origin;

    return json({
      success: true,
      id: draft.id,
      previewUrl: draftPreviewPublicUrl(draft.id, origin),
      expiresAt: draft.expiresAt,
    });
  } catch (error) {
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to store draft preview',
      },
      { status: 400 },
    );
  }
}

export const action = withSecurity(draftPreviewAction, { requireAuth: true });
