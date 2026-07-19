import { atom, computed } from 'nanostores';

export type InitialBuildLifecycle = 'idle' | 'generating' | 'finalizing' | 'preview-ready' | 'failed';

export const initialBuildLifecycle = atom<InitialBuildLifecycle>('idle');

export const buildRecommendationsReady = computed(
  initialBuildLifecycle,
  (state) => state === 'idle' || state === 'preview-ready',
);

export function beginInitialBuild() {
  initialBuildLifecycle.set('generating');
}

export function failInitialBuild() {
  if (initialBuildLifecycle.get() !== 'idle') {
    initialBuildLifecycle.set('failed');
  }
}
