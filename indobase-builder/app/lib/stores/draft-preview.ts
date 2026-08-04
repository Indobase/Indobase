import { atom } from 'nanostores';

export type DraftPreviewState = {
  error?: string;
  expiresAt?: number;
  previewUrl?: string;
  status: 'idle' | 'building' | 'ready' | 'error';
};

export const draftPreviewStore = atom<DraftPreviewState>({ status: 'idle' });

async function revealWorkbenchPreview(opts?: { markLifecycleReady?: boolean }) {
  try {
    const { workbenchStore } = await import('~/lib/stores/workbench');
    const { initialBuildLifecycle } = await import('~/lib/stores/build-lifecycle');

    workbenchStore.currentView.set('preview');
    workbenchStore.showWorkbench.set(true);

    if (opts?.markLifecycleReady) {
      const life = initialBuildLifecycle.get();

      if (life === 'generating' || life === 'finalizing' || life === 'scoping') {
        initialBuildLifecycle.set('preview-ready');
      }
    }
  } catch {
    // SSR / store not ready
  }
}

export function setDraftPreviewBuilding() {
  draftPreviewStore.set({ status: 'building', previewUrl: undefined, error: undefined });
  void revealWorkbenchPreview();
}

export function setDraftPreviewReady(previewUrl: string, expiresAt?: number) {
  draftPreviewStore.set({ status: 'ready', previewUrl, expiresAt, error: undefined });
  void revealWorkbenchPreview({ markLifecycleReady: true });
}

export function setDraftPreviewError(error: string) {
  draftPreviewStore.set({ status: 'error', error, previewUrl: undefined });
}

export function clearDraftPreview() {
  draftPreviewStore.set({ status: 'idle' });
}
