import { atom, computed } from 'nanostores';

export type InitialBuildLifecycle =
  | 'idle'
  | 'scoping'
  | 'generating'
  | 'finalizing'
  | 'preview-ready'
  | 'failed';

export const initialBuildLifecycle = atom<InitialBuildLifecycle>('idle');

export const buildRecommendationsReady = computed(
  initialBuildLifecycle,
  /*
   * Hide chips only while the initial build is actively generating/finalizing so they
   * do not flicker mid-stream. After preview success — or a failed build the user can
   * still continue from — show recommendation chips again. Scoping (clarifying questions)
   * also keeps chips hidden so the intake card owns the turn.
   */
  (state) => state === 'idle' || state === 'preview-ready' || state === 'failed',
);

/** Emergent-style intake: open the preview pane while questions are answered. */
export function beginScoping() {
  initialBuildLifecycle.set('scoping');
}

export function beginInitialBuild() {
  initialBuildLifecycle.set('generating');
}

export function failInitialBuild() {
  if (initialBuildLifecycle.get() !== 'idle') {
    initialBuildLifecycle.set('failed');
  }
}
