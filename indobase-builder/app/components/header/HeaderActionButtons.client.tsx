import { useStore } from '@nanostores/react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';

interface HeaderActionButtonsProps {
  chatStarted: boolean;
}

/**
 * Quiet overflow actions for the workspace header.
 * Publish lives on the workbench top bar (Emergent pattern).
 */
export function HeaderActionButtons({ chatStarted }: HeaderActionButtonsProps) {
  const filesCount = useStore(workbenchStore.filesCountAtom);
  const previews = useStore(workbenchStore.previews);

  const shouldShowButtons = chatStarted && (filesCount > 0 || previews.length > 0);

  if (!shouldShowButtons) {
    return null;
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex h-9 items-center gap-1 rounded-full bg-white/80 px-3 text-sm text-gray-600 shadow-sm ring-1 ring-black/5 transition hover:bg-white hover:text-gray-900"
          title="More actions"
          aria-label="More actions"
        >
          <span className="i-ph:dots-three-bold text-lg" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        className={classNames(
          'z-[250] min-w-[200px] rounded-xl border border-gray-200 bg-white py-1 shadow-lg',
        )}
        sideOffset={6}
        align="end"
      >
        <DropdownMenu.Item
          className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-gray-700 outline-none hover:bg-gray-50"
          onSelect={() =>
            window.open('https://github.com/Indobase/Indobase/issues/new?template=bug_report.yml', '_blank')
          }
        >
          <span className="i-ph:bug" />
          Report Bug
        </DropdownMenu.Item>
        <DropdownMenu.Item
          className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-gray-700 outline-none hover:bg-gray-50"
          onSelect={async () => {
            try {
              const { downloadDebugLog } = await import('~/utils/debugLogger');
              await downloadDebugLog();
            } catch (error) {
              console.error('Failed to download debug log:', error);
            }
          }}
        >
          <span className="i-ph:download" />
          Debug Log
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
