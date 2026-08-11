import { signIndobaseBuilderMcpToken } from '~/lib/indobase/handoff.server';
import {
  getManagedPocketBaseConfig,
  type ServerEnv,
} from '~/lib/pocketbase/managed.server';
import type { IndobaseBuilderHandoffPayload } from '~/types/indobase';
import { BUILDER_MCP_TOKEN_TTL_SECONDS } from '~/lib/indobase/builder-session.constants';

async function adminAuth(env?: ServerEnv): Promise<{ token: string; config: NonNullable<ReturnType<typeof getManagedPocketBaseConfig>> }> {
  const config = getManagedPocketBaseConfig(env);
  if (!config) {
    throw new Error('Indobase backend is not configured');
  }

  const attempts = [
    `${config.adminUrl}/api/collections/_superusers/auth-with-password`,
    `${config.adminUrl}/api/admins/auth-with-password`,
  ];

  let lastError = 'Indobase backend admin auth failed';

  for (const endpoint of attempts) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identity: config.adminEmail,
          password: config.adminPassword,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { token?: string; message?: string };
      if (response.ok && payload.token) {
        return { token: payload.token, config };
      }
      lastError = payload.message || `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(lastError);
}

/**
 * Ensure the auth collection allows OTP signup for Builder operators.
 * Engine-specific details stay server-side — never surfaced to users.
 */
export async function ensureBuilderAuthReady(env?: ServerEnv): Promise<{ ok: true; publicUrl: string }> {
  const { token, config } = await adminAuth(env);

  const listResponse = await fetch(`${config.adminUrl}/api/collections?page=1&perPage=50`, {
    headers: { Authorization: token },
  });
  const listPayload = (await listResponse.json().catch(() => ({}))) as {
    items?: Array<{ id: string; name: string; type?: string; otp?: { enabled?: boolean }; createRule?: string | null }>;
    message?: string;
  };

  if (!listResponse.ok) {
    throw new Error(listPayload.message || 'Failed to load auth collections');
  }

  const users = listPayload.items?.find((item) => item.name === 'users' && item.type === 'auth');
  if (!users) {
    throw new Error('Indobase backend auth collection is missing');
  }

  if (!users.otp?.enabled || users.createRule === null) {
    const patch = await fetch(`${config.adminUrl}/api/collections/${users.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        otp: { enabled: true, duration: 300 },
        // Empty create rule = public signup via OTP for Builder operators
        createRule: '',
      }),
    });
    if (!patch.ok) {
      const err = (await patch.json().catch(() => ({}))) as { message?: string };
      throw new Error(err.message || 'Failed to enable Indobase backend OTP');
    }
  }

  return { ok: true, publicUrl: config.publicUrl };
}

export async function requestBuilderEmailOtp(options: {
  env?: ServerEnv;
  email: string;
}): Promise<{ otpId: string }> {
  await ensureBuilderAuthReady(options.env);
  const config = getManagedPocketBaseConfig(options.env);
  if (!config) {
    throw new Error('Indobase backend is not configured');
  }

  const email = options.email.trim().toLowerCase();
  const response = await fetch(`${config.adminUrl}/api/collections/users/request-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    otpId?: string;
    message?: string;
  };

  if (!response.ok || !payload.otpId) {
    throw new Error(payload.message || 'Could not send sign-in code');
  }

  return { otpId: payload.otpId };
}

export async function verifyBuilderEmailOtp(options: {
  env?: ServerEnv;
  otpId: string;
  code: string;
}): Promise<{
  email: string;
  userId: string;
  backendToken: string;
  sessionToken: string;
  expiresAt: number;
}> {
  const config = getManagedPocketBaseConfig(options.env);
  if (!config) {
    throw new Error('Indobase backend is not configured');
  }

  const response = await fetch(`${config.adminUrl}/api/collections/users/auth-with-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      otpId: options.otpId,
      otp: options.code.trim(),
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    token?: string;
    record?: { id?: string; email?: string };
    message?: string;
  };

  if (!response.ok || !payload.token || !payload.record?.id || !payload.record?.email) {
    throw new Error(payload.message || 'Invalid or expired code');
  }

  const email = payload.record.email.trim().toLowerCase();
  const userId = payload.record.id;
  const now = Math.floor(Date.now() / 1000);
  const publicUrl = config.publicUrl.replace(/\/+$/, '');

  /*
   * Mint a Builder session JWT compatible with existing requireAuth / chat gates.
   * No Studio / GoTrue — project_ref is the Builder OS operator scope.
   */
  const handoffLike: IndobaseBuilderHandoffPayload = {
    aud: 'indobase-builder',
    email,
    exp: now + BUILDER_MCP_TOKEN_TTL_SECONDS,
    iat: now,
    iss: publicUrl,
    organization_slug: 'indobase',
    project_name: 'Indobase Builder',
    project_ref: 'builder-os',
    studio_url: 'https://builder.indobase.in',
    sub: userId,
    backend: {
      anon_key: 'indobase-backend',
      api_url: publicUrl,
      auth_url: publicUrl,
      project_name: 'Indobase Builder',
      project_ref: 'builder-os',
      project_url: publicUrl,
      public_env: {
        INDOBASE_ANON_KEY: 'indobase-backend',
        INDOBASE_URL: publicUrl,
        NEXT_PUBLIC_INDOBASE_ANON_KEY: 'indobase-backend',
        NEXT_PUBLIC_INDOBASE_URL: publicUrl,
        VITE_INDOBASE_ANON_KEY: 'indobase-backend',
        VITE_INDOBASE_URL: publicUrl,
        EXPO_PUBLIC_INDOBASE_ANON_KEY: 'indobase-backend',
        EXPO_PUBLIC_INDOBASE_URL: publicUrl,
      },
      rest_url: publicUrl,
      storage_url: publicUrl,
    },
  };

  const sessionToken = signIndobaseBuilderMcpToken(handoffLike, BUILDER_MCP_TOKEN_TTL_SECONDS, options.env);

  return {
    email,
    userId,
    backendToken: payload.token,
    sessionToken,
    expiresAt: (now + BUILDER_MCP_TOKEN_TTL_SECONDS) * 1000,
  };
}
