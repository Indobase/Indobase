import { useEffect } from 'react';
import { useNavigate } from '@remix-run/react';

import { redirectToStudioBuilderConnect, restoreBuilderSessionOnLoad } from '~/lib/indobase/builder-auth.client';
import { isBuilderBackendConnected } from '~/lib/indobase/connection';
import { getStoredIndobaseConnection } from '~/lib/indobase/mcp';

export default function ConnectRoute() {
  const navigate = useNavigate();

  useEffect(() => {
    void (async () => {
      const restored = await restoreBuilderSessionOnLoad();
      const connection = getStoredIndobaseConnection();

      if (restored && isBuilderBackendConnected(connection)) {
        navigate('/', { replace: true });
        return;
      }

      const returnTo = `${window.location.pathname}${window.location.search}`;
      redirectToStudioBuilderConnect(returnTo === '/connect' ? '/' : returnTo);
    })();
  }, [navigate]);

  return (
    <div className="flex h-full w-full items-center justify-center bg-bolt-elements-background-depth-1 p-8">
      <div className="max-w-lg rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6 text-center">
        <div className="i-ph:spinner-gap mx-auto mb-4 animate-spin text-2xl text-bolt-elements-textSecondary" />
        <h1 className="text-lg font-semibold text-bolt-elements-textPrimary">Signing in to Indobase</h1>
        <p className="mt-2 text-sm text-bolt-elements-textSecondary">Redirecting you to email sign-in…</p>
      </div>
    </div>
  );
}
