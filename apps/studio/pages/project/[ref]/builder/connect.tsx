import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from '@remix-run/react';
import { getAccessToken, useParams } from 'common';
import { toast } from 'sonner';

import { withAuth } from 'hooks/misc/withAuth';

function BuilderConnectPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { ref: routeRef } = useParams() as { ref?: string };
  const [status, setStatus] = useState('Connecting Builder to your Indobase project…');

  useEffect(() => {
    const projectRef = routeRef || searchParams.get('project_ref') || searchParams.get('ref');
    const returnTo = searchParams.get('return_to') || '/';

    if (!projectRef) {
      setStatus('Missing project ref. Open Builder from a Studio project.');
      toast.error('Project ref is required to open Builder');
      return;
    }

    const connect = async () => {
      try {
        const accessToken = await getAccessToken();

        if (!accessToken) {
          const signInReturn = `/project/${encodeURIComponent(projectRef)}/builder/connect?return_to=${encodeURIComponent(returnTo)}`;
          navigate(`/sign-in?returnTo=${encodeURIComponent(signInReturn)}`);
          return;
        }

        const launchParams = new URLSearchParams();
        launchParams.set('next', returnTo);

        const response = await fetch(
          `/api/platform/projects/${encodeURIComponent(projectRef)}/builder/launch?${launchParams.toString()}`,
          {
            method: 'GET',
            credentials: 'include',
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );

        const payload = await response.json().catch(() => ({}));

        if (!response.ok || !payload?.url) {
          throw new Error(payload?.message || `Failed to open Builder (${response.status})`);
        }

        window.location.href = payload.url;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to open Builder';
        setStatus(message);
        toast.error(message);
      }
    };

    void connect();
  }, [navigate, routeRef, searchParams]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-8">
      <div className="max-w-lg rounded-xl border border-default bg-surface-100 p-6 text-center">
        <h1 className="text-lg font-semibold text-foreground">Opening Indobase Builder</h1>
        <p className="mt-3 text-sm text-foreground-light">{status}</p>
      </div>
    </div>
  );
}

export default withAuth(BuilderConnectPage);
