import { useEffect } from 'react';
import { useNavigate } from '@remix-run/react';

import {
  getStudioBuilderConnectUrl,
  redirectToStudioBuilderConnect,
  restoreBuilderSessionOnLoad,
} from '~/lib/indobase/builder-auth.client';
import { hasIndobaseStudioHandoff } from '~/lib/indobase/connection';
import { getStoredSupabaseConnection } from '~/lib/indobase/mcp';

export default function ConnectRoute() {
  const navigate = useNavigate();

  useEffect(() => {
    void (async () => {
      const restored = await restoreBuilderSessionOnLoad();
      const connection = getStoredSupabaseConnection();

      if (restored && hasIndobaseStudioHandoff(connection)) {
        navigate('/', { replace: true });
        return;
      }

      const returnTo = `${window.location.pathname}${window.location.search}`;

      if (connection?.indobase?.projectRef || connection?.selectedProjectId) {
        redirectToStudioBuilderConnect(returnTo === '/connect' ? '/' : returnTo);
        return;
      }

      window.location.href = getStudioBuilderConnectUrl({ returnTo: '/' });
    })();
  }, [navigate]);

  return (
    <div className="flex h-full w-full items-center justify-center bg-bolt-elements-background-depth-1 p-8">
      <div className="max-w-lg rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6 text-center">
        <div className="i-ph:spinner-gap mx-auto mb-4 animate-spin text-2xl text-bolt-elements-textSecondary" />
        <h1 className="text-lg font-semibold text-bolt-elements-textPrimary">Connecting to Indobase</h1>
        <p className="mt-2 text-sm text-bolt-elements-textSecondary">
          Redirecting you through Studio to link this Builder session to your project backend…
        </p>
      </div>
    </div>
  );
}
