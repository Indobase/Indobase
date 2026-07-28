import { atom } from 'nanostores';

export type DraftPreviewState = {
  error?: string;
  expiresAt?: number;
  previewUrl?: string;
  status: 'idle' | 'building' | 'ready' | 'error';
};

export const draftPreviewStore = atom<DraftPreviewState>({ status: 'idle' });

export function setDraftPreviewBuilding() {
  draftPreviewStore.set({ status: 'building', previewUrl: undefined, error: undefined });
}

export function setDraftPreviewReady(previewUrl: string, expiresAt?: number) {
  draftPreviewStore.set({ status: 'ready', previewUrl, expiresAt, error: undefined });
}

export function setDraftPreviewError(error: string) {
  draftPreviewStore.set({ status: 'error', error, previewUrl: undefined });
}

export function clearDraftPreview() {
  draftPreviewStore.set({ status: 'idle' });
}
