/**
 * Long-horizon autonomy phases for complex Builder runs (E3-style MVP).
 * Injected into the instant plan so the coder still ships in one shot, but
 * treats verify → design polish → integrations as mandatory phases.
 */

export type AutonomyPhaseId = 'scaffold' | 'implement' | 'verify' | 'design-polish' | 'integrations';

export const AUTONOMY_PHASE_LABELS: Record<AutonomyPhaseId, string> = {
  scaffold: 'Scaffold',
  implement: 'Implement',
  verify: 'Verify preview',
  'design-polish': 'Design polish',
  integrations: 'First-hour integrations',
};

/** Appended to complex instant plans — no extra LLM planner round. */
export function getAutonomyPhaseChecklist(options: {
  wantsAuth: boolean;
  wantsPay: boolean;
  wantsDb: boolean;
  mobile?: boolean;
}): string {
  const integrationBits: string[] = [];

  if (options.wantsAuth) {
    integrationBits.push('Indobase Auth (sign-in/sign-up with linked project credentials)');
  }

  if (options.wantsDb) {
    integrationBits.push('Indobase client/tables for real data');
  }

  if (options.wantsPay) {
    integrationBits.push(
      'Indobase Payments checkout (never raw Stripe Checkout.js unless the user explicitly refuses Indobase Payments)',
    );
  }

  if (options.mobile) {
    integrationBits.push('Expo web preview; keep Android/iOS store packaging for Studio mobile builds');
  }

  const integrationsLine =
    integrationBits.length > 0
      ? `Wire first-hour integrations: ${integrationBits.join('; ')}`
      : 'Skip unused auth/payments/DB unless the prompt requires them';

  return `Autonomy checklist (complete in this same response — do not wait for the user):
- ${AUTONOMY_PHASE_LABELS.scaffold}: runnable Vite/Expo project at repo root
- ${AUTONOMY_PHASE_LABELS.implement}: working vertical slice with real interactions (loading/empty/error)
- ${AUTONOMY_PHASE_LABELS.verify}: npm install + npm run dev; app must load without console-breaking errors
- ${AUTONOMY_PHASE_LABELS['design-polish']}: industry-fit palette (never purple/indigo), expressive type pairing, no Unsplash, no 3-card AI landing clone
- ${AUTONOMY_PHASE_LABELS.integrations}: ${integrationsLine}
Prefer shipping a working vertical slice over perfect architecture.`;
}
