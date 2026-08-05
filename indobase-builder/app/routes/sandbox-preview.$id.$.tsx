import type { LoaderFunctionArgs } from '@remix-run/node';

import { resolveSandboxPreviewResponse } from '~/lib/indobase/live-preview-sandbox.server';

export async function loader({ params }: LoaderFunctionArgs) {
  const id = params.id?.trim();
  const splat = params['*'] ?? '';

  if (!id) {
    return new Response('Not found', { status: 404 });
  }

  const response = await resolveSandboxPreviewResponse(id, splat || 'index.html');

  if (!response) {
    return new Response('Sandbox preview expired or not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return response;
}
