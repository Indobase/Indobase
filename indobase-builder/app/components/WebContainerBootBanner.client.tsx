import { useStore } from '@nanostores/react';
import { webcontainerBootErrorAtom } from '~/lib/webcontainer';

export function WebContainerBootBanner() {
  const error = useStore(webcontainerBootErrorAtom);

  if (!error) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 top-0 z-[9999] border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-md">
      <p className="font-semibold">Indobase Builder workspace could not start</p>
      <p className="mt-1">{error}</p>
      <p className="mt-2 text-xs text-amber-900/90">
        Your console shows <strong>Redirect Blocker</strong> and wallet extensions still active — disable them for{' '}
        <strong>builder.indobase.in</strong>, then hard-refresh (Chrome or Edge).
      </p>
    </div>
  );
}
