import { describe, expect, it } from 'vitest';

import { getGenerationCapabilityPromptAppendix } from './generation-capability-context';

describe('getGenerationCapabilityPromptAppendix', () => {
  it('returns empty when credentials are incomplete', () => {
    expect(getGenerationCapabilityPromptAppendix({})).toBe('');
    expect(
      getGenerationCapabilityPromptAppendix({
        projectRef: 'proj_1',
        apiUrl: 'https://proj_1.indobase.in',
      }),
    ).toBe('');
  });

  it('includes Platform capability snapshot without product hosts', () => {
    const appendix = getGenerationCapabilityPromptAppendix({
      projectRef: 'proj_1',
      apiUrl: 'https://proj_1.indobase.in',
      anonKey: 'anon',
    });

    expect(appendix).toContain('indobase_project_capabilities');
    expect(appendix).toContain('auth');
    expect(appendix).toContain('Capability Resolver');
    expect(appendix).not.toContain('payments.indobase.in');
    expect(appendix).not.toContain('studio.indobase.in');
  });
});
