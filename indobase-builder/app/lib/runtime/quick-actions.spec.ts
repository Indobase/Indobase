import { describe, expect, it } from 'vitest';
import { hasRenderableQuickActions } from './quick-actions';

describe('hasRenderableQuickActions', () => {
  it('returns false for plain text with no quick-action markup', () => {
    expect(hasRenderableQuickActions('All done! Your site is ready.')).toBe(false);
    expect(hasRenderableQuickActions('')).toBe(false);
  });

  it('returns false for an empty <bolt-quick-actions> group (fallback chips must show)', () => {
    expect(hasRenderableQuickActions('Done.<bolt-quick-actions></bolt-quick-actions>')).toBe(false);
    expect(hasRenderableQuickActions('Done.<bolt-quick-actions>\n  \n</bolt-quick-actions>')).toBe(false);
  });

  it('returns false for a group containing only non-chip content', () => {
    expect(hasRenderableQuickActions('<bolt-quick-actions>Some stray text</bolt-quick-actions>')).toBe(false);
  });

  it('returns true for properly formed singular chips (fallback hidden)', () => {
    const text =
      'Done.<bolt-quick-actions><bolt-quick-action type="message" message="Polish it">Polish it</bolt-quick-action></bolt-quick-actions>';
    expect(hasRenderableQuickActions(text)).toBe(true);
  });

  it('returns true for mistaken <boltAction type="message"> chips inside the group (parser recovers them)', () => {
    const text =
      'Done.<bolt-quick-actions><boltAction type="message">Add dark mode</boltAction><boltAction type="message">Improve SEO</boltAction></bolt-quick-actions>';
    expect(hasRenderableQuickActions(text)).toBe(true);
  });

  it('returns true for mistaken boltAction chips carrying a message attribute', () => {
    const text =
      '<bolt-quick-actions><boltAction type="message" message="Polish the hero"></boltAction></bolt-quick-actions>';
    expect(hasRenderableQuickActions(text)).toBe(true);
  });

  it('ignores non-message boltAction tags inside the group', () => {
    const text = '<bolt-quick-actions><boltAction type="shell">npm run dev</boltAction></bolt-quick-actions>';
    expect(hasRenderableQuickActions(text)).toBe(false);
  });
});
