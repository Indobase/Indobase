import { useStore } from '@nanostores/react';
import { shouldSuggestExtensionDisable } from '~/lib/webcontainer/boot-errors';
import { webcontainerBootErrorAtom } from '~/lib/webcontainer';
import { isServerPreviewMode } from '~/lib/webcontainer/preview-mode';

export function WebContainerBootBanner() {
  const error = useStore(webcontainerBootErrorAtom);

  if (!error) {
    return null;
  }

  /*
   * On a keyless host WebContainer is not expected to boot — server preview is the intended mode,
   * and previews still work. Shouting "workspace could not start" there tells the user the product
   * is broken when it is running normally, so the banner stays out of the way.
   */
  if (isServerPreviewMode()) {
    return null;
  }

  const showExtensionHint = shouldSuggestExtensionDisable(error);

  return (
    <div className="fixed inset-x-0 top-0 z-[9999] border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-md">
      <p className="font-semibold">Indobase Builder workspace could not start</p>
      <p className="mt-1">{error}</p>
      <p className="mt-2 text-xs text-amber-900/90">
        Click the terminal reset button (↻) to tear down and retry without a full reload.
        {/WEBCONTAINER_API_KEY|allowlist|headless 404/i.test(error)
          ? ' An admin must set WEBCONTAINER_API_KEY on the Builder service and allowlist this domain in the StackBlitz WebContainer API Console.'
          : showExtensionHint
            ? ' If Redirect Blocker, ad-block, or wallet extensions are enabled for this site, disable them for builder.indobase.in / builder.indobase.fun, then hard-refresh (Chrome or Edge).'
            : ' If reset fails, hard-refresh the page (Chrome or Edge).'}
      </p>
    </div>
  );
}
