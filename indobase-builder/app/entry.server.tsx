import type { AppLoadContext, EntryContext } from '@remix-run/node';
import { createReadableStreamFromReadable } from '@remix-run/node';
import { RemixServer } from '@remix-run/react';
import { isbot } from 'isbot';
import { PassThrough } from 'node:stream';
import { renderToPipeableStream } from 'react-dom/server';

const ABORT_DELAY = 5_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
  _loadContext: AppLoadContext,
) {
  const userAgent = request.headers.get('user-agent') || '';
  const callbackName = isbot(userAgent) ? 'onAllReady' : 'onShellReady';

  return new Promise<Response>((resolve, reject) => {
    let timeoutId: NodeJS.Timeout | undefined;
    let didError = false;

    const { pipe, abort } = renderToPipeableStream(
      <RemixServer context={remixContext} url={request.url} />,
      {
        [callbackName]() {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }

          const body = new PassThrough();
          responseHeaders.set('Content-Type', 'text/html');
          // Must match WebContainer.boot({ coep: 'credentialless' }) in lib/webcontainer/index.ts
          responseHeaders.set('Cross-Origin-Embedder-Policy', 'credentialless');
          responseHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
          // StackBlitz validates allowlisted hosts via Referer — do not use same-origin here.
          responseHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');

          resolve(
            new Response(createReadableStreamFromReadable(body), {
              headers: responseHeaders,
              status: didError ? 500 : responseStatusCode,
            }),
          );

          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          didError = true;
          responseStatusCode = 500;
          console.error(error);
        },
      },
    );

    timeoutId = setTimeout(() => abort(), ABORT_DELAY);
    request.signal.addEventListener('abort', () => abort());
  });
}
