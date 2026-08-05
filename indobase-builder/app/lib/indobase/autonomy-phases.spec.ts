import { describe, expect, it } from 'vitest';
import { getAutonomyPhaseChecklist } from './autonomy-phases';

describe('getAutonomyPhaseChecklist', () => {
  it('names every autonomy phase and Indobase Payments when pay is requested', () => {
    const text = getAutonomyPhaseChecklist({
      wantsAuth: true,
      wantsPay: true,
      wantsDb: false,
    });

    expect(text).toContain('Autonomy checklist');
    expect(text).toContain('Design polish');
    expect(text).toContain('Indobase Payments');
    expect(text).toContain('never raw Stripe');
  });
});
