import { json, type ActionFunctionArgs } from '@remix-run/node';
import { withSecurity } from '~/lib/security';
import { ensureManagedPocketBase, isManagedPocketBaseConfigured } from '~/lib/pocketbase/managed.server';

type EnsureBody = {
  appId?: string;
  seed?: string;
};

async function pocketbaseEnsureAction({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ ok: false, message: 'Method not allowed' }, { status: 405 });
  }

  const env = (context as { cloudflare?: { env?: Record<string, string | undefined> } })?.cloudflare?.env;

  if (!isManagedPocketBaseConfigured(env)) {
    return json(
      {
        ok: false,
        configured: false,
        message: 'Indobase backend is not configured on this Builder.',
      },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as EnsureBody;

  try {
    const result = await ensureManagedPocketBase({
      env,
      appId: typeof body.appId === 'string' ? body.appId : undefined,
      seed: typeof body.seed === 'string' ? body.seed : undefined,
    });

    return json({
      ok: true,
      configured: true,
      url: result.url,
      appId: result.appId,
      backendProvider: 'pocketbase',
    });
  } catch (error) {
    return json(
      {
        ok: false,
        configured: true,
        message: error instanceof Error ? error.message : 'Failed to ensure Indobase backend',
      },
      { status: 502 },
    );
  }
}

export const action = withSecurity(pocketbaseEnsureAction, {
  rateLimit: true,
});
