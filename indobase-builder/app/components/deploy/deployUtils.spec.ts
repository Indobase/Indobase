import { describe, expect, it } from 'vitest';

import { formatBuildFailureOutput, stripAnsi } from './deployUtils';

describe('deployUtils', () => {
  it('strips ansi color codes from build output', () => {
    expect(stripAnsi('\u001b[1mnpm\u001b[22m \u001b[31merror\u001b[39m ENOENT')).toBe('npm error ENOENT');
  });

  it('formats build failures without ansi codes', () => {
    expect(formatBuildFailureOutput('\u001b[31merror\u001b[39m missing package.json')).toBe('error missing package.json');
  });
});
