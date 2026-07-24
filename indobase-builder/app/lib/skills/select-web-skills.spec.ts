import { describe, expect, it } from 'vitest';
import { getWebSkillsPromptAppendix, selectWebSkills } from './select-web-skills';

describe('selectWebSkills', () => {
  it('defaults Vite/React web builds to react + tailwind skills', () => {
    const selected = selectWebSkills({
      target: 'web',
      messages: [{ role: 'user', content: 'Build a landing page for a coffee shop with a nice UI' }],
    });

    expect(selected.map((skill) => skill.id)).toEqual(
      expect.arrayContaining(['react-best-practices', 'tailwind-design-system']),
    );
    expect(selected.length).toBeLessThanOrEqual(3);
  });

  it('selects Next.js skill when the prompt asks for App Router', () => {
    const selected = selectWebSkills({
      target: 'web',
      messages: [{ role: 'user', content: 'Create a Next.js App Router dashboard with server components' }],
    });

    expect(selected.some((skill) => skill.id === 'nextjs-app-router-patterns')).toBe(true);
  });

  it('selects Expo/React Native skills for mobile targets', () => {
    const selected = selectWebSkills({
      target: 'mobile',
      messages: [{ role: 'user', content: 'Build a React Native Expo fitness tracker' }],
    });

    expect(selected.map((skill) => skill.id)).toEqual(
      expect.arrayContaining(['react-native-architecture', 'expo-deployment']),
    );
  });

  it('honors the character budget and does not dump the catalog', () => {
    const selected = selectWebSkills({
      target: 'web',
      maxSkills: 2,
      maxChars: 8_000,
      messages: [
        {
          role: 'user',
          content: 'Vite React Tailwind shadcn zod tanstack query performance SEO blog PWA',
        },
      ],
    });

    expect(selected.length).toBeLessThanOrEqual(2);
    expect(selected.reduce((sum, skill) => sum + skill.content.length, 0)).toBeLessThanOrEqual(8_000);
  });

  it('builds a prompt appendix with skill tags', () => {
    const appendix = getWebSkillsPromptAppendix({
      target: 'web',
      messages: [{ role: 'user', content: 'Make a Vite React app with Tailwind' }],
    });

    expect(appendix).toContain('<web_development_skills');
    expect(appendix).toContain('davila7/claude-code-templates');
    expect(appendix).toContain('<web_skill id="react-best-practices">');
  });

  it('selects Indobase Payments skill for checkout / pricing prompts', () => {
    const selected = selectWebSkills({
      target: 'web',
      messages: [
        {
          role: 'user',
          content: 'Add a pricing page with Stripe checkout and a customer billing portal',
        },
      ],
    });

    expect(selected.some((skill) => skill.id === 'indobase-payments')).toBe(true);
    expect(selected.some((skill) => skill.id === 'shopify-development')).toBe(false);
  });
});
