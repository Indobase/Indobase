import { describe, expect, it } from 'vitest';

import { detectProjectCommands } from './projectCommands';

describe('detectProjectCommands', () => {
  it('installs with --include=dev so Vite (devDependency) is available after restore', async () => {
    const commands = await detectProjectCommands([
      {
        path: 'package.json',
        content: JSON.stringify({
          scripts: { dev: 'vite' },
          dependencies: { react: '^18.0.0' },
          devDependencies: { vite: '^5.0.0' },
        }),
      },
    ]);

    expect(commands.setupCommand).toContain('--include=dev');
    expect(commands.setupCommand).toContain('npm install');
    expect(commands.startCommand).toBe('npm run dev');
  });
});
