import { classNames } from '~/utils/classNames';
import { redirectToStudioBuilderConnect } from '~/lib/indobase/builder-auth.client';

interface BackendLinkBannerProps {
  className?: string;
}

export function BackendLinkBanner({ className }: BackendLinkBannerProps) {
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
            Open Builder from Studio once to enable publish, database tools, MCP, and prompt quota. You can also use{' '}
            <code className="text-xs">/connect</code> anytime to relink.
          </p>
        </div>
        <button
          type="button"
          onClick={() => redirectToStudioBuilderConnect()}
          className="shrink-0 rounded-lg bg-bolt-elements-button-primary-background px-4 py-2 text-sm font-medium text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover"
        >
          Connect via Studio
        </button>
      </div>
    </div>
  );
}
