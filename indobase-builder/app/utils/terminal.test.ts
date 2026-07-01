import { describe, expect, it } from 'vitest';
import { coloredText } from './terminal';

describe('coloredText', () => {
  it('supports status colors used by the terminal store', () => {
    expect(typeof coloredText.red).toBe('function');
    expect(typeof coloredText.yellow).toBe('function');
    expect(coloredText.yellow('status')).toContain('status');
  });
});
