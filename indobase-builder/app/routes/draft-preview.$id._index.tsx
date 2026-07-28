import type { LoaderFunctionArgs } from '@remix-run/node';

import { resolveDraftPreviewFile } from '~/lib/indobase/draft-preview.server';

export async function loader({ params }: LoaderFunctionArgs) {
  const id = params.id?.trim();

  if (!id) {
    return new Response('Not found', { status: 404 });
  }

  const file = resolveDraftPreviewFile(id, 'index.html');

  if (!file) {
    return new Response('Draft preview expired or not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return new Response(file.content, {
    status: 200,
    headers: {
      'Content-Type': file.contentType,
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "frame-ancestors 'self'",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
