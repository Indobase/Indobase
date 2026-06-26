import { type LoaderFunction } from '@remix-run/cloudflare';

const WEBCONTAINER_API_VERSION = '1.6.1-internal.1';
const ALLOWED_EDITOR_ORIGINS = new Set(['https://stackblitz.com', 'https://webcontainer.io']);

function resolveEditorOrigin(raw: string | null): string {
  const fallback = 'https://stackblitz.com';

  if (!raw) {
    return fallback;
  }

  try {
    const parsed = new URL(raw);

    if (parsed.protocol !== 'https:') {
      return fallback;
    }

    const origin = parsed.origin;

    if (!ALLOWED_EDITOR_ORIGINS.has(origin)) {
      return fallback;
    }

    return origin;
  } catch {
    return fallback;
  }
}

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const editorOrigin = resolveEditorOrigin(url.searchParams.get('editorOrigin'));

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Connect to WebContainer</title>
  </head>
  <body>
    <script type="module">
      (async () => {
        const { setupConnect } = await import('https://cdn.jsdelivr.net/npm/@webcontainer/api@${WEBCONTAINER_API_VERSION}/dist/connect.js');
        setupConnect({
          editorOrigin: ${JSON.stringify(editorOrigin)}
        });
      })();
    </script>
  </body>
</html>`;

  return new Response(htmlContent, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  });
};
