import { json, type LoaderFunctionArgs, redirect } from '@remix-run/cloudflare';
import { useLoaderData, useNavigate } from '@remix-run/react';
import { useEffect } from 'react';

import { updateSupabaseConnection } from '~/lib/stores/supabase';
import { buildSupabaseConnectionFromHandoff } from '~/lib/indobase/handoff';
import { signIndobaseBuilderMcpToken, verifyIndobaseStudioHandoff } from '~/lib/indobase/handoff.server';

const BUILDER_MCP_COOKIE = 'indobase_builder_mcp';

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const handoffToken = url.searchParams.get('handoff') || url.searchParams.get('token');
  const next = url.searchParams.get('next');
  const env = (context as { cloudflare?: { env?: Record<string, string | undefined> } })?.cloudflare
    ?.env;

  if (!handoffToken) {
    return redirect('/');
  }

  try {
    const handoff = await verifyIndobaseStudioHandoff(handoffToken, env);
    const mcpToken = signIndobaseBuilderMcpToken(handoff, 60 * 60 * 12, env);
    const maxAge = 60 * 60 * 12;
    const nodeEnv = env?.NODE_ENV ?? process.env.NODE_ENV;
    const secure = nodeEnv === 'production' ? '; Secure' : '';

    return json(
      { handoff, mcpToken, next },
      {
        headers: {
          'Set-Cookie': `${BUILDER_MCP_COOKIE}=${mcpToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`,
        },
      },
    );
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : 'Invalid Builder launch token',
      },
      { status: 400 },
    );
  }
};

export default function LaunchRoute() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!('handoff' in data) || !data.handoff) {
      return;
    }

    updateSupabaseConnection(buildSupabaseConnectionFromHandoff(data.handoff, { mcpToken: data.mcpToken }));
    const next = typeof data.next === 'string' ? data.next : null;
    const isSafeRelativePath =
      Boolean(next) && next!.startsWith('/') && !next!.startsWith('//') && !next!.includes('://');
    navigate(isSafeRelativePath ? next! : '/', { replace: true });
  }, [data, navigate]);

  if ('error' in data) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-bolt-elements-background-depth-1 p-8">
        <div className="max-w-lg rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6">
          <h1 className="text-xl font-semibold text-bolt-elements-textPrimary">Unable to open Builder</h1>
          <p className="mt-3 text-sm text-bolt-elements-textSecondary">{data.error}</p>
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
