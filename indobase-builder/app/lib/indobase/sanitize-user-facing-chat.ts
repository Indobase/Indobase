/**
 * Turn raw assistant markdown into Emergent-style conversational copy.
 * Technical work (stacks, npm, files) must never appear in the chat bubble.
 */

import { stripInternalRoutingAnnotations } from './sanitize-plan-text';

const TECH_LINE_RE =
  /\b(?:vite|react|typescript|javascript|nodejs?|npm|pnpm|yarn|bun|expo|webpack|tailwind|shadcn|next\.?js|package\.json|boltArtifact|boltAction|filePath|webcontainer|stackblitz|openrouter|qwen\/|deepseek\/|autonomy checklist|##\s*build steps|build plan)\b/i;

const SECTION_HEADING_RE = /^#{1,4}\s*(?:build steps|build plan|autonomy checklist|implementation|tech(?:nical)? stack|dependencies)\b/i;

/**
 * Remove technical dumps the model often echoes from the planner / system prompts.
 * Keeps short human sentences; drops plan lists and stack talk.
 */
export function toConversationalAssistantText(raw: string): string {
  if (!raw?.trim()) {
    return '';
  }

  let text = stripInternalRoutingAnnotations(raw);

  // Drop fenced code blocks (implementation detail).
  text = text.replace(/```[\s\S]*?```/g, '\n');

  // Drop XML-ish tool / plan wrappers if any survived the parser.
  text = text
    .replace(/<\/?(?:agent_plan|coder_contract|clarifying_questions|boltArtifact|boltAction)[^>]*>/gi, '\n')
    .replace(/<\/?div\b[^>]*>/gi, '\n');

  const lines = text.split('\n');
  const kept: string[] = [];
  let skippingSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (kept.length && kept[kept.length - 1] !== '') {
        kept.push('');
      }
      continue;
    }

    if (SECTION_HEADING_RE.test(trimmed)) {
      skippingSection = true;
      continue;
    }

    // Next markdown heading ends a skipped section.
    if (skippingSection) {
      if (/^#{1,4}\s+/.test(trimmed) && !SECTION_HEADING_RE.test(trimmed)) {
        skippingSection = false;
      } else if (/^(?:\d+[.)]|[-*])\s+/.test(trimmed) || /^-\s*\[[ x]\]/i.test(trimmed)) {
        continue;
      } else if (TECH_LINE_RE.test(trimmed)) {
        continue;
      } else {
        // Non-list prose after a plan heading — still skip until blank break of section.
        if (/^(?:\d+[.)]|[-*])\s+/.test(trimmed) || TECH_LINE_RE.test(trimmed)) {
          continue;
        }
        // Allow short non-tech sentences to end the skip.
        if (!TECH_LINE_RE.test(trimmed) && trimmed.length < 160 && !/^(?:\d+[.)]|[-*])\s+/.test(trimmed)) {
          skippingSection = false;
        } else {
          continue;
        }
      }
    }

    if (/^(?:\d+[.)]|[-*])\s+/.test(trimmed) && TECH_LINE_RE.test(trimmed)) {
      continue;
    }

    if (/^-\s*\[[ x]\]/i.test(trimmed)) {
      continue;
    }

    if (TECH_LINE_RE.test(trimmed)) {
      continue;
    }

    // Strip leftover artifact placeholders the parser left as empty lines / titles.
    if (/^creating\b.*\bfiles?\b/i.test(trimmed) && TECH_LINE_RE.test(trimmed)) {
      continue;
    }

    kept.push(trimmed);
  }

  let out = kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // If everything was technical, use a calm default — progress UI covers the rest.
  if (!out) {
    return '';
  }

  // Cap rant length: keep first 2 short paragraphs.
  const paragraphs = out.split(/\n\n+/).filter(Boolean);
  const short = paragraphs
    .slice(0, 2)
    .map((p) => (p.length > 280 ? `${p.slice(0, 277).trim()}…` : p))
    .join('\n\n');

  return short;
}

/** True when the only useful UI is the plan/progress cards (no chat prose needed). */
export function isEmptyConversationalText(raw: string): boolean {
  return !toConversationalAssistantText(raw);
}
