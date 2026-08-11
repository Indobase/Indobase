import { json, type ActionFunctionArgs } from '@remix-run/node';
import { withSecurity } from '~/lib/security';

type PublishBody = {
  slug?: string;
  files?: Record<string, string>;
  metadata?: Record<string, unknown>;
  appId?: string;
  pocketbaseUrl?: string;
};

function readEnv(env: Record<string, string | undefined> | undefined, key: string) {
  return env?.[key]?.trim() || (typeof process !== 'undefined' ? process.env[key]?.trim() : undefined) || '';
}

async function pocketbasePublishAction({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ ok: false, message: 'Method not allowed' }, { status: 405 });
  }

  const env = (context as { cloudflare?: { env?: Record<string, string | undefined> } })?.cloudflare?.env;
  const provisionerUrl = readEnv(env, 'APP_HOST_PROVISIONER_URL').replace(/\/+$/, '');
  const token = readEnv(env, 'APP_HOST_PROVISIONER_TOKEN') || readEnv(env, 'APP_HOST_TOKEN');

  if (!provisionerUrl) {
    return json(
      {
        ok: false,
        message:
          'App host is not configured. Set APP_HOST_PROVISIONER_URL (and token) on Builder to publish without Studio.',
      },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as PublishBody;
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  const files = body.files && typeof body.files === 'object' ? body.files : null;

  if (!slug || !files || Object.keys(files).length === 0) {
    return json({ ok: false, message: 'slug and files are required' }, { status: 400 });
  }

  // Inject Indobase backend public URL into shipped .env if missing.
  const pbUrl = typeof body.pocketbaseUrl === 'string' ? body.pocketbaseUrl.trim() : '';
  if (pbUrl && !files['.env'] && !files['/.env']) {
    files['.env'] = `VITE_INDOBASE_URL=${pbUrl}\nNEXT_PUBLIC_INDOBASE_URL=${pbUrl}\n`;
  }

  const response = await fetch(`${provisionerUrl}/deploy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      slug,
      files,
      metadata: {
        ...(body.metadata || {}),
        appId: body.appId,
        pocketbaseUrl: pbUrl || undefined,
      },
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    url?: string;
    slug?: string;
    message?: string;
  };

  if (!response.ok || !payload.ok) {
    return json(
      {
        ok: false,
        message: payload.message || `App host deploy failed (${response.status})`,
      },
      { status: response.status >= 400 ? response.status : 502 },
    );
  }

  return json({
    ok: true,
    url: payload.url,
    slug: payload.slug || slug,
  });
}

export const action = withSecurity(pocketbasePublishAction, {
  rateLimit: true,
});
