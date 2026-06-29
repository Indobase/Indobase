import { describe, expect, it } from 'vitest';
import { resolveTemplateFromMessage } from './resolveTemplateFromMessage';

describe('resolveTemplateFromMessage', () => {
  it('matches explicit template instructions', () => {
    const template = resolveTemplateFromMessage('Use the "Indobase Auth App" template and customize it for my product.');

    expect(template?.name).toBe('Indobase Auth App');
    expect(template?.localBundle).toBe('indobase-auth-app');
  });

  it('matches aliases when template is mentioned', () => {
    const template = resolveTemplateFromMessage('Start from the todo app template for my team');

    expect(template?.name).toBe('Indobase Todo App');
  });

  it('returns null when no template is referenced', () => {
    expect(resolveTemplateFromMessage('Build me a random landing page')).toBeNull();
  });
});
