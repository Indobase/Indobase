import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { useLoaderData, useNavigate, useSearchParams } from '@remix-run/react';
import { useEffect, useState } from 'react';

import { updateIndobaseConnection } from '~/lib/stores/indobase-connection';
import { buildIndobaseConnectionFromHandoff } from '~/lib/indobase/handoff';
import { getStudioBuilderConnectUrl, persistLastProjectRef } from '~/lib/indobase/builder-auth.client';
import { clearHandoffTokenFromLocation, readHandoffTokenFromLocation } from '~/lib/indobase/launch-hash.client';
import { completeBuilderHandoff } from '~/lib/indobase/launch-handoff.server';
import { isProductionEnv } from '~/lib/production.server';
import { initializeProviders } from '~/lib/stores/settings';
import { useMCPStore } from '~/lib/stores/mcp';
import type { IndobaseBuilderHandoffPayload } from '~/types/indobase';

type LaunchLoaderData =
  | {
      error: string;
      mode: 'error';
    }
  | {
      handoff: IndobaseBuilderHandoffPayload;
      mcpToken: string;
      mode: 'ready';
      next: string | null;
    }
  | {
      mode: 'client';
      next: string | null;
      projectRef: string | null;
    };

function applyLaunchSuccess(options: {
  handoff: IndobaseBuilderHandoffPayload;
  mcpToken: string;
  navigate: ReturnType<typeof useNavigate>;
  next: string | null;
  popup: boolean;
}) {
  updateIndobaseConnection(buildIndobaseConnectionFromHandoff(options.handoff, { mcpToken: options.mcpToken }));
  persistLastProjectRef(options.handoff.project_ref);

  void (async () => {
    await initializeProviders();
    await useMCPStore.getState().initialize();
    await useMCPStore.getState().syncWithIndobaseConnection();

    if (options.popup && window.opener) {
      /*
       * The popup was opened by the Builder main window and, after the Studio round-trip,
       * is now back on the Builder origin. The opener is therefore same-origin — post to
       * window.location.origin, not the Studio origin, or the browser drops the message.
       */
      window.opener.postMessage(
        {
          type: 'indobase-builder-session',
          projectRef: options.handoff.project_ref,
          success: true,
        },
        window.location.origin,
      );
      window.close();

      return;
    }

    if (options.popup && window.parent !== window) {
      window.parent.postMessage(
        {
          type: 'indobase-builder-session',
          projectRef: options.handoff.project_ref,
          success: true,
        },
        window.location.origin,
      );
      return;
    }

    const isSafeRelativePath =
      Boolean(options.next) &&
      options.next!.startsWith('/') &&
      !options.next!.startsWith('//') &&
      !options.next!.includes('://');
    options.navigate(isSafeRelativePath ? options.next! : '/', { replace: true });
  })();
}

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('handoff') || url.searchParams.get('token');
  const next = url.searchParams.get('next');
  const projectRef = url.searchParams.get('project_ref') || url.searchParams.get('ref');
  const env = (context as { cloudflare?: { env?: Record<string, string | undefined> } })?.cloudflare?.env;

  // Legacy query-string tokens still work for small payloads; large JWTs use URL hash + POST.
  if (!queryToken) {
    return json({
      mode: 'client',
      next,
      projectRef,
    } satisfies LaunchLoaderData);
  }

  try {
    const { handoff, mcpToken, cookieHeader } = await completeBuilderHandoff(queryToken, env);

    return json(
      {
        mode: 'ready',
        handoff,
        mcpToken,
        next,
      } satisfies LaunchLoaderData,
      {
        headers: {
          'Set-Cookie': cookieHeader,
        },
      },
    );
  } catch (error) {
    const message = isProductionEnv(env)
      ? 'Invalid or expired Builder launch link. Reconnect from Studio.'
      : error instanceof Error
        ? error.message
        : 'Invalid Builder launch token';

    return json({ mode: 'error', error: message } satisfies LaunchLoaderData, { status: 400 });
  }
};

export default function LaunchRoute() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectRef = searchParams.get('project_ref') || searchParams.get('ref');
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    const popup = searchParams.get('popup') === '1';
    const next = searchParams.get('next');

    if (data.mode === 'ready') {
      applyLaunchSuccess({
        handoff: data.handoff,
        mcpToken: data.mcpToken,
        navigate,
        next: data.next,
        popup,
      });
      return;
    }

    if (data.mode !== 'client') {
      return;
    }

    const handoffToken = readHandoffTokenFromLocation();

    if (!handoffToken) {
      setClientError('Missing Builder launch token. Reconnect from Studio.');
      return;
    }

    void (async () => {
      try {
        const response = await fetch('/api/indobase/launch', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            handoffToken,
            next,
          }),
        });

        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          handoff?: IndobaseBuilderHandoffPayload;
          mcpToken?: string;
          success?: boolean;
        };

        clearHandoffTokenFromLocation();

        if (!response.ok || !payload.success || !payload.handoff || !payload.mcpToken) {
          setClientError(payload.error || 'Invalid or expired Builder launch link. Reconnect from Studio.');
          return;
        }

        applyLaunchSuccess({
          handoff: payload.handoff,
          mcpToken: payload.mcpToken,
          navigate,
          next,
          popup,
        });
      } catch {
        setClientError('Failed to complete Builder launch. Reconnect from Studio.');
      }
    })();
  }, [data, navigate, searchParams]);

  const errorMessage = data.mode === 'error' ? data.error : clientError;

  if (errorMessage) {
    const reconnectUrl = projectRef
      ? getStudioBuilderConnectUrl({ projectRef, returnTo: '/' })
      : getStudioBuilderConnectUrl({ returnTo: '/' });

    return (
      <div className="flex h-full w-full items-center justify-center bg-bolt-elements-background-depth-1 p-8">
        <div className="max-w-lg rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6">
          <h1 className="text-xl font-semibold text-bolt-elements-textPrimary">Unable to open Builder</h1>
          <p className="mt-3 text-sm text-bolt-elements-textSecondary">{errorMessage}</p>
          <a
            href={reconnectUrl}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-bolt-elements-button-primary-background px-4 py-2 text-sm font-medium text-bolt-elements-button-primary-text"
          >
            Reconnect from Studio
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-bolt-elements-background-depth-1">
      <div className="flex items-center gap-3 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-5 py-4 text-sm text-bolt-elements-textSecondary">
        <div className="i-ph:spinner-gap animate-spin text-lg" />
        Connecting Builder to your Indobase project...
      </div>
    </div>
  );
}
