import { atom } from 'nanostores';
import type { BuildId, SnapshotId } from '~/lib/workspace/ids';

/** Preview lifecycle — UI reads this, not backend-specific flags. */
export type PreviewLifecycle = 'idle' | 'preparing' | 'building' | 'ready' | 'error' | 'restarting';

export type PreviewBackend = 'none' | 'webcontainer' | 'draft' | 'static';

export type PreviewManagerState = {
  lifecycle: PreviewLifecycle;
  backend: PreviewBackend;
  previewUrl?: string;
  error?: string;
  expiresAt?: number;
  snapshotId?: SnapshotId;
  buildId?: BuildId;
};

export const previewManagerState = atom<PreviewManagerState>({
  lifecycle: 'idle',
  backend: 'none',
});

function patch(next: Partial<PreviewManagerState>) {
  previewManagerState.set({ ...previewManagerState.get(), ...next });
}

/** Draft preview wins when already building or ready — WC finalize must not clobber it. */
function isDraftAuthoritative(state: PreviewManagerState = previewManagerState.get()): boolean {
  return state.backend === 'draft' && (state.lifecycle === 'ready' || state.lifecycle === 'building');
}

export function previewIdle() {
  previewManagerState.set({ lifecycle: 'idle', backend: 'none', previewUrl: undefined, error: undefined });
}

export function previewPreparing(options?: { backend?: PreviewBackend; snapshotId?: SnapshotId }) {
  if (options?.backend === 'webcontainer' && isDraftAuthoritative()) {
    return;
  }

  patch({
    lifecycle: 'preparing',
    backend: options?.backend ?? previewManagerState.get().backend,
    snapshotId: options?.snapshotId,
    error: undefined,
    previewUrl: undefined,
  });
}

export function previewBuilding(options: { backend: PreviewBackend; buildId?: BuildId; snapshotId?: SnapshotId }) {
  if (options.backend === 'webcontainer' && isDraftAuthoritative()) {
    return;
  }

  patch({
    lifecycle: 'building',
    backend: options.backend,
    buildId: options.buildId,
    snapshotId: options.snapshotId ?? previewManagerState.get().snapshotId,
    error: undefined,
  });
}

export function previewReady(options: {
  previewUrl: string;
  backend: PreviewBackend;
  snapshotId?: SnapshotId;
  buildId?: BuildId;
  expiresAt?: number;
}) {
  const current = previewManagerState.get();

  if (options.backend === 'webcontainer' && current.backend === 'draft' && current.lifecycle === 'ready') {
    return;
  }

  patch({
    lifecycle: 'ready',
    backend: options.backend,
    previewUrl: options.previewUrl,
    snapshotId: options.snapshotId,
    buildId: options.buildId,
    expiresAt: options.expiresAt,
    error: undefined,
  });
}

export function previewError(error: string, backend?: PreviewBackend) {
  const current = previewManagerState.get();

  if (backend === 'webcontainer' && isDraftAuthoritative(current)) {
    return;
  }

  patch({
    lifecycle: 'error',
    error,
    previewUrl: undefined,
    backend: backend ?? current.backend,
  });
}

export function previewRestarting() {
  patch({
    lifecycle: 'restarting',
    error: undefined,
    previewUrl: undefined,
  });
}

/** Derived helpers for UI — prefer lifecycle over scattered booleans. */
export function isPreviewBusy(state: PreviewManagerState = previewManagerState.get()): boolean {
  return state.lifecycle === 'preparing' || state.lifecycle === 'building' || state.lifecycle === 'restarting';
}

export function previewUrlFromManager(state: PreviewManagerState = previewManagerState.get()): string | undefined {
  return state.lifecycle === 'ready' ? state.previewUrl : undefined;
}
