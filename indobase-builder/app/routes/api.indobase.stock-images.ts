import { json } from '@remix-run/cloudflare';
import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { resolveStockImageUrl, type OpenverseEnv } from '~/lib/indobase/stock-images/openverse.server';

/**
 * POST /api/indobase/stock-images
 * Body: { queries: string[] }
 * Returns verified Openverse HTTPS URLs for Builder stock placeholders.
 */
export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const cloudflareEnv = (context as { cloudflare?: { env?: OpenverseEnv } })?.cloudflare?.env;

  let body: { queries?: unknown };

  try {
    body = (await request.json()) as { queries?: unknown };
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const raw = Array.isArray(body.queries) ? body.queries : [];
  const queries = [
    ...new Set(
      raw
        .filter((q): q is string => typeof q === 'string')
        .map((q) => q.trim().slice(0, 120))
        .filter(Boolean),
    ),
  ].slice(0, 12);

  if (queries.length === 0) {
    return json({ results: {} as Record<string, { url: string; title: string; attribution: string }> });
  }

  const results: Record<string, { url: string; title: string; attribution: string; license: string }> = {};

  await Promise.all(
    queries.map(async (q) => {
      try {
        const hit = await resolveStockImageUrl(q, cloudflareEnv);
        if (hit?.url) {
          results[q] = {
            url: hit.url,
            title: hit.title,
            attribution: hit.attribution,
            license: hit.license,
          };
        }
      } catch {
        // leave missing — caller keeps placeholder / fails lint
      }
    }),
  );

  return json({ results });
}
