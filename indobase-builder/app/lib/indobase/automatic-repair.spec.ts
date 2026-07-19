import { describe, expect, it } from 'vitest';
import { decideAutomaticPreviewRepair } from './automatic-repair';
import { GeneratedCodeValidationError } from './generated-code-validation';

describe('automatic preview repair decisions', () => {
  const error = new GeneratedCodeValidationError([
    {
      filePath: 'src/components/Services.jsx',
      message: "'return' outside of function.",
      line: 30,
      column: 5,
      source: 'syntax',
    },
  ]);
  const files = {
    '/home/project/src/components/Services.jsx': {
      type: 'file' as const,
      content: 'export function Services() {}\nreturn <section />',
    },
    '/home/project/src/App.jsx': {
      type: 'file' as const,
      content: 'export function App() { return <Services /> }',
    },
  };

  it('builds a focused internal repair prompt with exact diagnostics and source', () => {
    const decision = decideAutomaticPreviewRepair({ error, completedAttempts: 0, files });

    expect(decision).toMatchObject({
      shouldRepair: true,
      nextAttempt: 1,
      implicatedFiles: ['src/components/Services.jsx'],
    });

    if (decision.shouldRepair) {
      expect(decision.prompt).toContain('[Orchestrator Agent]');
      expect(decision.prompt).toContain('src/components/Services.jsx:30:5');
      expect(decision.prompt).toContain('export function Services()');
      expect(decision.prompt).not.toContain('export function App()');
      expect(decision.prompt).toContain('implicated files only');
      expect(decision.prompt).toContain('NEVER regenerate the whole project');
    }
  });

  it('never repairs or consumes budget on transient preview flakiness', () => {
    const transientError = new GeneratedCodeValidationError(
      [
        { filePath: 'src/App.tsx', message: 'Failed to fetch', source: 'preview' },
        { filePath: 'src/components/Menu.tsx', message: 'Failed to fetch', source: 'preview' },
        { filePath: 'src/components/Contact.tsx', message: 'Failed to fetch', source: 'preview' },
      ],
      'Vite preview compile failed',
    );

    expect(decideAutomaticPreviewRepair({ error: transientError, completedAttempts: 0, files })).toEqual({
      shouldRepair: false,
      nextAttempt: 0,
      reason: 'transient',
    });

    // Still transient even at the budget boundary — the attempt count must not move.
    expect(decideAutomaticPreviewRepair({ error: transientError, completedAttempts: 2, files })).toEqual({
      shouldRepair: false,
      nextAttempt: 2,
      reason: 'transient',
    });

    expect(
      decideAutomaticPreviewRepair({ error: new TypeError('Failed to fetch'), completedAttempts: 1, files }),
    ).toEqual({
      shouldRepair: false,
      nextAttempt: 1,
      reason: 'transient',
    });
  });

  it('still repairs when transient noise is mixed with a real compile error', () => {
    const mixedError = new GeneratedCodeValidationError(
      [
        { filePath: 'src/App.tsx', message: 'Failed to fetch', source: 'preview' },
        { filePath: 'src/components/Services.jsx', message: "'return' outside of function. (30:4)", source: 'preview' },
      ],
      'Vite preview compile failed',
    );
    const decision = decideAutomaticPreviewRepair({ error: mixedError, completedAttempts: 0, files });

    expect(decision).toMatchObject({ shouldRepair: true, nextAttempt: 1 });
  });

  it('repairs incomplete scaffolds: missing referenced components become a focused repair prompt', () => {
    const missingFileError = new GeneratedCodeValidationError([
      {
        filePath: 'src/App.tsx',
        message: 'Missing file for import "./components/JuiceCards" — the referenced module was never generated.',
        line: 3,
        source: 'structure',
      },
    ]);
    const decision = decideAutomaticPreviewRepair({
      error: missingFileError,
      completedAttempts: 0,
      files: {
        '/home/project/src/App.tsx': {
          type: 'file' as const,
          content: "import JuiceCards from './components/JuiceCards';",
        },
      },
    });

    expect(decision).toMatchObject({ shouldRepair: true, nextAttempt: 1, implicatedFiles: ['src/App.tsx'] });

    if (decision.shouldRepair) {
      expect(decision.prompt).toContain('./components/JuiceCards');
      expect(decision.prompt).toContain('never generated');
    }
  });

  it('stops after the bounded attempt count', () => {
    expect(decideAutomaticPreviewRepair({ error, completedAttempts: 3, files, maxAttempts: 3 })).toEqual({
      shouldRepair: false,
      nextAttempt: 3,
      reason: 'exhausted',
    });
  });
});
