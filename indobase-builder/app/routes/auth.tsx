import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from '@remix-run/react';
import { ClientOnly } from 'remix-utils/client-only';
import { toast } from 'react-toastify';
import { updateIndobaseConnection } from '~/lib/stores/indobase-connection';
import { syncProfileFromStudioIdentity } from '~/lib/stores/profile';
import { persistLastProjectRef } from '~/lib/indobase/builder-auth.client';

function AuthPageInner() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('return_to') || '/';

  const [email, setEmail] = useState('');
  const [otpId, setOtpId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // If a session cookie already works, skip the form.
    void fetch('/api/indobase/session', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        const data = (await response.json().catch(() => ({}))) as { success?: boolean; email?: string };
        if (data.success) {
          navigate(returnTo, { replace: true });
        }
      })
      .catch(() => undefined);
  }, [navigate, returnTo]);

  async function requestCode() {
    setPending(true);
    setError('');

    try {
      const response = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        otpId?: string;
        message?: string;
      };

      if (!response.ok || !data.ok || !data.otpId) {
        throw new Error(data.message || 'Could not send sign-in code');
      }

      setOtpId(data.otpId);
      toast.success('Code sent — check your email');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send sign-in code');
    } finally {
      setPending(false);
    }
  }

  async function verifyCode() {
    if (!otpId) {
      return;
    }

    setPending(true);
    setError('');

    try {
      const response = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ otpId, code }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        mcpToken?: string;
        email?: string;
        sub?: string;
        backend?: { url?: string; appId?: string };
        message?: string;
      };

      if (!response.ok || !data.ok || !data.mcpToken || !data.email) {
        throw new Error(data.message || 'Invalid or expired code');
      }

      syncProfileFromStudioIdentity({ email: data.email, sub: data.sub });
      persistLastProjectRef(data.backend?.appId || 'builder-os');

      if (data.backend?.url && data.backend?.appId) {
        updateIndobaseConnection({
          backendProvider: 'pocketbase',
          connectionSource: 'pocketbase',
          pocketbase: { url: data.backend.url, appId: data.backend.appId },
          selectedProjectId: data.backend.appId,
          credentials: undefined,
          indobase: {
            apiUrl: data.backend.url,
            authUrl: data.backend.url,
            mcpToken: data.mcpToken,
            organizationSlug: 'indobase',
            projectRef: 'builder-os',
            projectUrl: data.backend.url,
            restUrl: data.backend.url,
            storageUrl: data.backend.url,
            studioUrl: 'https://builder.indobase.in',
          },
          user: {
            id: data.sub || data.email,
            email: data.email,
            role: 'builder',
            created_at: new Date().toISOString(),
            last_sign_in_at: new Date().toISOString(),
          },
          project: {
            id: data.backend.appId,
            name: 'Indobase backend',
            region: 'indobase',
            organization_id: 'indobase',
            status: 'active',
            created_at: new Date().toISOString(),
          },
          isConnected: true,
        });
      } else {
        updateIndobaseConnection({
          indobase: {
            apiUrl: 'https://backend.indobase.in',
            authUrl: 'https://backend.indobase.in',
            mcpToken: data.mcpToken,
            organizationSlug: 'indobase',
            projectRef: 'builder-os',
            projectUrl: 'https://builder.indobase.in',
            restUrl: 'https://backend.indobase.in',
            storageUrl: 'https://backend.indobase.in',
            studioUrl: 'https://builder.indobase.in',
          },
          user: {
            id: data.sub || data.email,
            email: data.email,
            role: 'builder',
            created_at: new Date().toISOString(),
            last_sign_in_at: new Date().toISOString(),
          },
          selectedProjectId: 'builder-os',
          connectionSource: 'studio_handoff',
          backendProvider: 'indobase',
          isConnected: true,
          credentials: {
            apiUrl: 'https://backend.indobase.in',
            anonKey: 'indobase-backend',
          },
        });
      }

      toast.success('Signed in');
      navigate(returnTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired code');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0B1220] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(1200px 600px at 20% -10%, rgba(59,143,214,0.35), transparent 60%), radial-gradient(900px 500px at 90% 10%, rgba(16,185,129,0.18), transparent 55%), linear-gradient(180deg, #0B1220 0%, #111827 100%)',
        }}
      />
      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-16">
        <p className="text-sm font-medium tracking-[0.22em] text-[#3B8FD6]">INDOBASE</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Sign in to Builder</h1>
        <p className="mt-3 text-[15px] leading-6 text-white/70">
          Enter your email. We&apos;ll send a one-time code — no password needed.
        </p>

        <div className="mt-8 space-y-4">
          {!otpId ? (
            <>
              <label className="block text-sm text-white/70">
                Email
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none ring-[#3B8FD6] placeholder:text-white/35 focus:ring-2"
                  placeholder="you@company.com"
                  required
                />
              </label>
              <button
                type="button"
                disabled={pending || !email.trim()}
                onClick={() => void requestCode()}
                className="w-full rounded-xl bg-[#3B8FD6] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#347fc0] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? 'Sending…' : 'Send code'}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-white/60">
                Code sent to <span className="text-white">{email}</span>
              </p>
              <label className="block text-sm text-white/70">
                One-time code
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none ring-[#3B8FD6] placeholder:text-white/35 focus:ring-2"
                  placeholder="6-digit code"
                  required
                />
              </label>
              <button
                type="button"
                disabled={pending || code.trim().length < 4}
                onClick={() => void verifyCode()}
                className="w-full rounded-xl bg-[#3B8FD6] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#347fc0] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? 'Verifying…' : 'Continue'}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setOtpId(null);
                  setCode('');
                  setError('');
                }}
                className="w-full text-sm text-white/55 hover:text-white"
              >
                Use a different email
              </button>
            </>
          )}

          {error ? <p className="text-sm text-red-300">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}

export default function AuthRoute() {
  return (
    <ClientOnly fallback={<div className="min-h-screen bg-[#0B1220]" />}>
      {() => <AuthPageInner />}
    </ClientOnly>
  );
}
