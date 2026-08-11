import { json, type ActionFunctionArgs } from '@remix-run/node';
import { withSecurity } from '~/lib/security';

type PocketBaseHealthBody = {
  url?: string;
};

async function pocketbaseHealthAction({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ ok: false, message: 'Method not allowed' }, { status: 405 });
  }

  const body = (await request.json().catch(() => ({}))) as PocketBaseHealthBody;
  const url = typeof body.url === 'string' ? body.url.trim().replace(/\/+$/, '') : '';

  if (!/^https?:\/\/.+/.test(url)) {
    return json({ ok: false, message: 'A valid backend URL is required' }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`${url}/api/health`, {
      method: 'GET',
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      return json(
        {
          ok: false,
          message: `Indobase backend health check failed (${response.status})`,
          status: response.status,
        },
        { status: 502 },
      );
    }

    const payload = await response.json().catch(() => ({}));

    return json({
      ok: true,
      url,
      health: payload,
    });
  } catch (error) {
    return json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'Failed to reach Indobase backend',
      },
      { status: 502 },
    );
  }
}

export const action = withSecurity(pocketbaseHealthAction, {
  rateLimit: true,
});
