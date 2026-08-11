import { json, type ActionFunctionArgs } from '@remix-run/node';
import { withSecurity } from '~/lib/security';
import { requestBuilderEmailOtp } from '~/lib/indobase/builder-otp.server';

type Body = { email?: string };

async function requestOtpAction({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ ok: false, message: 'Method not allowed' }, { status: 405 });
  }

  const env = (context as { cloudflare?: { env?: Record<string, string | undefined> } })?.cloudflare?.env;
  const body = (await request.json().catch(() => ({}))) as Body;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, message: 'Enter a valid email address' }, { status: 400 });
  }

  try {
    const result = await requestBuilderEmailOtp({ env, email });
    return json({
      ok: true,
      otpId: result.otpId,
      message: 'Check your email for a sign-in code',
    });
  } catch (error) {
    return json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'Could not send sign-in code',
      },
      { status: 502 },
    );
  }
}

export const action = withSecurity(requestOtpAction, {
  requireAuth: false,
  rateLimit: true,
});
