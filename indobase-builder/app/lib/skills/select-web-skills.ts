import type { Message } from 'ai';
import type { FileMap } from '~/lib/.server/llm/constants';
import type { BuilderProjectTarget } from '~/lib/indobase/generation-contract';
import { WEB_SKILL_CATALOG, type WebSkillId } from './web-skill-catalog.generated';

export type SelectWebSkillsOptions = {
  messages: Array<Pick<Message, 'role' | 'content'>>;
  files?: FileMap;
  target: BuilderProjectTarget;
  /** Max skills to inject (default 3). */
  maxSkills?: number;
  /** Soft character budget for injected skill bodies (default 22_000). */
  maxChars?: number;
  /** Include playbooks when budget remains (default true). */
  includePlaybooks?: boolean;
};

export type SelectedWebSkill = {
  id: WebSkillId;
  score: number;
  content: string;
};

type SkillRule = {
  id: WebSkillId;
  /** Keyword / package patterns that raise this skill's score. */
  patterns: RegExp[];
  /** Extra score when the project target matches. */
  targetBonus?: Partial<Record<BuilderProjectTarget, number>>;
  /** Baseline score for matching default stacks (always considered). */
  baseline?: Partial<Record<BuilderProjectTarget, number>>;
};

/**
 * Stack-aware skill ranking. Builder defaults to Vite + React (+ Tailwind UI),
 * so Next/Svelte/etc. only win when the prompt or package.json clearly asks for them.
 */
const SKILL_RULES: SkillRule[] = [
  {
    id: 'react-best-practices',
    patterns: [/\breact\b/i, /\bvite\b/i, /\bjsx\b/i, /\btsx\b/i, /\bcomponent(s)?\b/i],
    baseline: { web: 12 },
    targetBonus: { web: 4 },
  },
  {
    id: 'tailwind-design-system',
    patterns: [/\btailwind\b/i, /\bdesign system\b/i, /\bui\b/i, /\bstyl(e|ing)\b/i, /\btheme\b/i, /\bcss\b/i],
    baseline: { web: 10 },
    targetBonus: { web: 2 },
  },
  {
    id: 'react-component-performance',
    patterns: [/\bperformance\b/i, /\bre-?render\b/i, /\bmemo(?:ize)?\b/i, /\boptimiz/i, /\bslow\b/i],
  },
  {
    id: 'web-performance-optimization',
    patterns: [/\b(lcp|cls|inp|core web vitals)\b/i, /\bbundle size\b/i, /\blazy load/i, /\bcode.?split/i],
  },
  {
    id: 'react-state-management',
    patterns: [/\bstate management\b/i, /\bglobal state\b/i, /\bredux\b/i, /\bjotai\b/i, /\brecoil\b/i],
  },
  {
    id: 'zustand-store-ts',
    patterns: [/\bzustand\b/i],
  },
  {
    id: 'tanstack-query-expert',
    patterns: [/\b(?:tanstack|react).?query\b/i, /\buseQuery\b/, /\bserver state\b/i],
  },
  {
    id: 'zod-validation-expert',
    patterns: [/\bzod\b/i, /\bschema validation\b/i, /\bform validation\b/i, /\bvalibot\b/i],
  },
  {
    id: 'shadcn',
    patterns: [/\bshadcn\b/i, /\bradix\b/i],
  },
  {
    id: 'nextjs-app-router-patterns',
    patterns: [/\bnext\.?js\b/i, /\bapp router\b/i, /\bserver components?\b/i, /\bnext\/\w+/i],
  },
  {
    id: 'sveltekit',
    patterns: [/\bsvelte(?:kit)?\b/i],
  },
  {
    id: 'astro',
    patterns: [/\bastro\b/i],
  },
  {
    id: 'hono',
    patterns: [/\bhono\b/i],
  },
  {
    id: 'drizzle-orm-expert',
    patterns: [/\bdrizzle\b/i, /\borm\b/i],
  },
  {
    id: 'progressive-web-app',
    patterns: [/\bpwa\b/i, /\bservice worker\b/i, /\bmanifest\.webmanifest\b/i, /\boffline.?first\b/i],
  },
  {
    id: 'building-blog',
    patterns: [/\bblog\b/i, /\bmdx\b/i, /\bcontent.?collection\b/i],
  },
  {
    id: 'roier-seo',
    patterns: [/\bseo\b/i, /\bmeta tags?\b/i, /\bopen graph\b/i, /\bsitemap\b/i],
  },
  {
    id: 'chrome-extension-developer',
    patterns: [/\bchrome extension\b/i, /\bbrowser extension\b/i, /\bmanifest v3\b/i],
  },
  {
    id: 'electron-development',
    patterns: [/\belectron\b/i, /\bdesktop app\b/i],
  },
  {
    id: 'shopify-development',
    patterns: [/\bshopify\b/i, /\bliquid\b/i],
  },
  {
    id: 'fastapi-endpoint',
    patterns: [/\bfastapi\b/i, /\bpython api\b/i],
  },
  {
    id: 'react-native-architecture',
    patterns: [/\breact native\b/i, /\bexpo\b/i, /\bmobile app\b/i],
    baseline: { mobile: 14 },
    targetBonus: { mobile: 6 },
  },
  {
    id: 'expo-deployment',
    patterns: [/\bexpo\b/i, /\beas build\b/i, /\bapp store\b/i],
    baseline: { mobile: 10 },
    targetBonus: { mobile: 4 },
  },
];

/** Framework skills that should suppress the default Vite/React baseline when clearly chosen. */
const FRAMEWORK_OVERRIDE: WebSkillId[] = [
  'nextjs-app-router-patterns',
  'sveltekit',
  'astro',
  'electron-development',
  'shopify-development',
];

function messageText(message: Pick<Message, 'content'>): string {
  if (Array.isArray(message.content)) {
    return message.content
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join('\n');
  }

  return String(message.content ?? '');
}

function packageJsonText(files?: FileMap): string {
  if (!files) {
    return '';
  }

  for (const [path, file] of Object.entries(files)) {
    if (file?.type === 'file' && (path === 'package.json' || path.endsWith('/package.json'))) {
      return file.content;
    }
  }

  return '';
}

function buildHaystack(messages: Array<Pick<Message, 'role' | 'content'>>, files?: FileMap): string {
  const recent = messages.slice(-8).map(messageText).join('\n');
  const pkg = packageJsonText(files);
  const paths = files ? Object.keys(files).slice(0, 80).join('\n') : '';

  return `${recent}\n${pkg}\n${paths}`;
}

function scoreSkill(rule: SkillRule, haystack: string, target: BuilderProjectTarget): number {
  let score = rule.baseline?.[target] ?? 0;
  score += rule.targetBonus?.[target] ?? 0;

  for (const pattern of rule.patterns) {
    if (pattern.test(haystack)) {
      score += 8;
    }
  }

  return score;
}

/**
 * Pick 1–N relevant vendored web-development skills for the current turn.
 * Does not dump the catalog — only skills with a positive score, capped by count/chars.
 */
export function selectWebSkills(options: SelectWebSkillsOptions): SelectedWebSkill[] {
  const maxSkills = options.maxSkills ?? 3;
  const maxChars = options.maxChars ?? 22_000;
  const includePlaybooks = options.includePlaybooks ?? true;
  const haystack = buildHaystack(options.messages, options.files);

  const ranked = SKILL_RULES.map((rule) => ({
    id: rule.id,
    score: scoreSkill(rule, haystack, options.target),
  }))
    .filter((entry) => entry.score > 0 && entry.id in WEB_SKILL_CATALOG)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const overrideHit = ranked.find((entry) => FRAMEWORK_OVERRIDE.includes(entry.id) && entry.score >= 8);
  const filtered = overrideHit
    ? ranked.filter((entry) => {
        if (entry.id === 'react-best-practices' || entry.id === 'tailwind-design-system') {
          // Keep Tailwind when still relevant; drop React baseline for non-React frameworks.
          if (entry.id === 'react-best-practices' && overrideHit.id !== 'nextjs-app-router-patterns') {
            return false;
          }
        }

        return true;
      })
    : ranked;

  const selected: SelectedWebSkill[] = [];
  let usedChars = 0;

  for (const entry of filtered) {
    if (selected.length >= maxSkills) {
      break;
    }

    const record = WEB_SKILL_CATALOG[entry.id];
    let content = record.body;

    if (includePlaybooks && record.playbook) {
      const withPlaybook = `${record.body}\n\n## Implementation playbook\n\n${record.playbook}`;

      if (usedChars + withPlaybook.length <= maxChars || selected.length === 0) {
        content = withPlaybook;
      }
    }

    if (selected.length > 0 && usedChars + content.length > maxChars) {
      continue;
    }

    // Hard truncate a single oversized skill so we still inject something useful.
    if (content.length > maxChars) {
      content = `${content.slice(0, maxChars)}\n\n…[truncated for context budget]`;
    }

    selected.push({ id: entry.id, score: entry.score, content });
    usedChars += content.length;
  }

  return selected;
}

/**
 * System-prompt appendix with selected skill bodies. Empty string when nothing matches.
 */
export function getWebSkillsPromptAppendix(options: SelectWebSkillsOptions): string {
  const selected = selectWebSkills(options);

  if (selected.length === 0) {
    return '';
  }

  const blocks = selected
    .map(
      (skill) => `<web_skill id="${skill.id}">
${skill.content}
</web_skill>`,
    )
    .join('\n\n');

  return `

<web_development_skills source="davila7/claude-code-templates" license="MIT">
Apply the following domain skills while generating. Prefer these patterns when they fit the user request and Indobase runtime contract. Do not mention these skill names to the user unless asked.

${blocks}
</web_development_skills>`;
}
