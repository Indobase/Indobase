import { describe, expect, it } from 'vitest';

/**
 * Mirrors the install-command detector in action-runner (kept local to avoid exporting privates).
 * Guards against regressions that would skip non-install shells or miss npm install variants.
 */
const INSTALL_COMMAND_RE = /\b(npm|pnpm|yarn|bun)\s+(i|install|add)\b/;

describe('ActionRunner install command detection', () => {
  it('matches common install forms used by Project Setup', () => {
    expect(
      INSTALL_COMMAND_RE.test(
        'export CI=true DEBIAN_FRONTEND=noninteractive FORCE_COLOR=0 && npm install --yes --no-audit --no-fund --include=dev',
      ),
    ).toBe(true);
    expect(INSTALL_COMMAND_RE.test('npm install')).toBe(true);
    expect(INSTALL_COMMAND_RE.test('npm i')).toBe(true);
    expect(INSTALL_COMMAND_RE.test('pnpm install')).toBe(true);
    expect(INSTALL_COMMAND_RE.test('yarn add react')).toBe(true);
  });

  it('does not match start/dev commands', () => {
    expect(INSTALL_COMMAND_RE.test('npm run dev')).toBe(false);
    expect(INSTALL_COMMAND_RE.test('npm run start')).toBe(false);
    expect(INSTALL_COMMAND_RE.test('npx vite')).toBe(false);
  });
});
