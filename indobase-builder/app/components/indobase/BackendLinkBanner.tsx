import { useState } from 'react';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';
import { redirectToStudioBuilderConnect } from '~/lib/indobase/builder-auth.client';
import { updateIndobaseConnection } from '~/lib/stores/indobase-connection';

interface BackendLinkBannerProps {
  className?: string;
}

export function BackendLinkBanner({ className }: BackendLinkBannerProps) {
  const [showForm, setShowForm] = useState(false);
  const [apiUrl, setApiUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [error, setError] = useState('');

  function handleConnect() {
    const url = apiUrl.trim().replace(/\/+$/, '');
    const key = anonKey.trim();

    if (!/^https?:\/\/.+/.test(url)) {
      setError('Enter a valid project URL, e.g. https://your-project.indobase.in');
      return;
    }

    if (!key) {
      setError('Paste your project anon (public) key.');
      return;
    }

    const projectRef = url.replace(/^https?:\/\//, '').split('.')[0] || 'indobase';

    updateIndobaseConnection({
      credentials: { apiUrl: url, anonKey: key, projectRef },
      selectedProjectId: projectRef,
      connectionSource: 'manual',
    });

    toast.success('Connected to your Indobase backend');
    setShowForm(false);
  }

  const inputClass =
    'mt-1 w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary outline-none transition-colors focus:border-bolt-elements-borderColorActive';

  return (
    <div
      className={classNames(
        'rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-bolt-elements-textPrimary',
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Link your Indobase backend</p>
          <p className="mt-1 text-bolt-elements-textSecondary">
            Connect to wire database, auth and storage into what you build. Connecting via Studio also unlocks publish,
            database tools, MCP and prompt quota.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowForm((v) => !v);
              setError('');
            }}
            className="rounded-lg border border-bolt-elements-borderColor px-3 py-2 text-sm font-medium text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-item-backgroundActive hover:text-bolt-elements-textPrimary"
          >
            {showForm ? 'Cancel' : 'Connect manually'}
          </button>
          <button
            type="button"
            onClick={() => redirectToStudioBuilderConnect()}
            className="rounded-lg bg-bolt-elements-button-primary-background px-4 py-2 text-sm font-medium text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover"
          >
            Connect via Studio
          </button>
        </div>
      </div>

      {showForm && (
        <div className="mt-3 flex flex-col gap-2 border-t border-amber-500/20 pt-3">
          <label className="text-xs font-medium text-bolt-elements-textSecondary">
            Project URL
            <input
              value={apiUrl}
              onChange={(e) => {
                setApiUrl(e.target.value);
                setError('');
              }}
              placeholder="https://your-project.indobase.in"
              className={inputClass}
            />
          </label>
          <label className="text-xs font-medium text-bolt-elements-textSecondary">
            Anon (public) key
            <input
              value={anonKey}
              onChange={(e) => {
                setAnonKey(e.target.value);
                setError('');
              }}
              placeholder="eyJhbGciOiJIUzI1NiIs..."
              className={inputClass}
            />
          </label>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="button"
            onClick={handleConnect}
            className="mt-1 self-start rounded-lg bg-bolt-elements-button-primary-background px-4 py-2 text-sm font-medium text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover"
          >
            Connect
          </button>
          <p className="text-xs text-bolt-elements-textTertiary">
            Find these in Studio → Project Settings → API (Project URL and the anon/public key).
          </p>
        </div>
      )}
    </div>
  );
}
