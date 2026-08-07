import { describe, expect, it } from 'vitest';

import { getDesignInstructions } from './design-instructions';
import { defaultDesignScheme } from '~/types/design-scheme';

describe('defaultDesignScheme', () => {
  it('does not use purple/AI-template primaries', () => {
    const { primary, accent, background } = defaultDesignScheme.palette;
    expect(primary.toLowerCase()).not.toMatch(/9e7fff|7c3aed|8b5cf6|6366f1/);
    expect(accent.toLowerCase()).not.toMatch(/f472b6|ec4899/);
    // Light-first default
    expect(background.toLowerCase()).toBe('#fafbfc');
    expect(primary.toLowerCase()).toBe('#3b8fd6');
  });
});

describe('getDesignInstructions', () => {
  it('bans purple template aesthetics', () => {
    const text = getDesignInstructions(defaultDesignScheme);
    expect(text).toContain('HARD BANS');
    expect(text).toContain('purple');
    expect(text).toContain('#3B8FD6');
    expect(text).not.toContain('gradients, glows, or parallax');
  });

  it('asks for industry-specific art direction when no scheme', () => {
    const text = getDesignInstructions();
    expect(text).toContain('never purple');
    expect(text).toContain('Art direction');
    expect(text).toContain('indobase-stock');
  });
});
