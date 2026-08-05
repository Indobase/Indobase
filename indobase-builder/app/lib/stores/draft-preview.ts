import { atom } from 'nanostores';
import type { BuildId, SnapshotId } from '~/lib/workspace/ids';
import {
  previewBuilding,
  previewError,
  previewIdle,
  previewManagerState,
  previewReady,
  type PreviewManagerState,
} from '~/lib/preview/preview-manager';

/** @deprecated Prefer previewManagerState — kept for gradual migration. */
export type DraftPreviewState = Pick<PreviewManagerState, 'error' | 'expiresAt' | 'previewUrl'> & {
  status: 'idle' | 'building' | 'ready' | 'error';
};

/** Mirrors preview manager for legacy subscribers. */
export const draftPreviewStore = atom<DraftPreviewState>({ status: 'idle' });

function syncLegacyStore() {
  const state = previewManagerState.get();
  const status =
    state.lifecycle === 'ready'
      ? 'ready'
      : state.lifecycle === 'error'
        ? 'error'
        : state.lifecycle === 'building' || state.lifecycle === 'preparing' || state.lifecycle === 'restarting'
          ? 'building'
          : 'idle';

  draftPreviewStore.set({
    status,
    previewUrl: state.previewUrl,
    error: state.error,
    expiresAt: state.expiresAt,
  });
}

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
  previewBuilding({ backend: 'draft' });
  syncLegacyStore();
  void revealWorkbenchPreview();
}

export function setDraftPreviewReady(
  previewUrl: string,
  expiresAt?: number,
  meta?: { snapshotId?: SnapshotId; buildId?: BuildId },
) {
  previewReady({
    previewUrl,
    backend: 'draft',
    expiresAt,
    snapshotId: meta?.snapshotId,
    buildId: meta?.buildId,
  });
  syncLegacyStore();
  void revealWorkbenchPreview({ markLifecycleReady: true });
}

export function setDraftPreviewError(error: string) {
  previewError(error, 'draft');
  syncLegacyStore();
}

export function clearDraftPreview() {
  previewIdle();
  syncLegacyStore();
}
