import { json, type ActionFunctionArgs } from '@remix-run/node';
import { withSecurity } from '~/lib/security';
import { verifyBuilderEmailOtp } from '~/lib/indobase/builder-otp.server';
import { BUILDER_MCP_COOKIE, BUILDER_MCP_TOKEN_TTL_SECONDS } from '~/lib/indobase/builder-session.constants';
import { ensureManagedPocketBase } from '~/lib/pocketbase/managed.server';

type Body = { otpId?: string; code?: string };

async function verifyOtpAction({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ ok: false, message: 'Method not allowed' }, { status: 405 });
  }

  const env = (context as { cloudflare?: { env?: Record<string, string | undefined> } })?.cloudflare?.env;
  const body = (await request.json().catch(() => ({}))) as Body;
  const otpId = typeof body.otpId === 'string' ? body.otpId.trim() : '';
  const code = typeof body.code === 'string' ? body.code.trim() : '';

  if (!otpId || !code) {
    return json({ ok: false, message: 'Enter the code from your email' }, { status: 400 });
  }

  try {
    const verified = await verifyBuilderEmailOtp({ env, otpId, code });

    // Attach managed backend for this Builder operator (agent path) after signup/sign-in.
    let backend: { url?: string; appId?: string } = {};
    try {
      const ensured = await ensureManagedPocketBase({
        env,
        seed: verified.email,
      });
      backend = { url: ensured.url, appId: ensured.appId };
    } catch {
      // Auth succeeds even if backend ensure is briefly unavailable.
    }

    const nodeEnv = env?.NODE_ENV ?? process.env.NODE_ENV;
    const secure = nodeEnv === 'production' ? '; Secure' : '';

    return json(
      {
        ok: true,
        success: true,
        mcpToken: verified.sessionToken,
        email: verified.email,
        sub: verified.userId,
        expiresAt: verified.expiresAt,
        projectRef: 'builder-os',
        organizationSlug: 'indobase',
        studioUrl: 'https://builder.indobase.in',
        backend,
      },
      {
        headers: {
          'Set-Cookie': `${BUILDER_MCP_COOKIE}=${verified.sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${BUILDER_MCP_TOKEN_TTL_SECONDS}${secure}`,
        },
      },
    );
  } catch (error) {
    return json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'Invalid or expired code',
      },
      { status: 401 },
    );
  }
}

export const action = withSecurity(verifyOtpAction, {
  requireAuth: false,
  rateLimit: true,
});
