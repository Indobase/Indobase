/**
 * Turn raw assistant markdown into Emergent-style conversational copy.
 * Technical work (stacks, npm, files) must never appear in the chat bubble.
 */

import { stripInternalRoutingAnnotations } from './sanitize-plan-text';

const TECH_LINE_RE =
  /\b(?:vite|react|typescript|javascript|nodejs?|npm|pnpm|yarn|bun|expo|webpack|tailwind|shadcn|next\.?js|package\.json|boltArtifact|boltAction|filePath|webcontainer|stackblitz|openrouter|qwen\/|deepseek\/|autonomy checklist|##\s*build steps|build plan)\b/i;

const SECTION_HEADING_RE = /^#{1,4}\s*(?:build steps|build plan|autonomy checklist|implementation|tech(?:nical)? stack|dependencies)\b/i;

/** Model sometimes apologizes about WC/workspace instead of emitting artifacts — drop that copy. */
const WORKSPACE_UNAVAILABLE_RE =
  /\b(?:build\s+)?workspace\s+isn'?t\s+available\b|\bwebcontainer\b.*\b(?:unavailable|not available|disabled)\b|\bcouldn'?t\s+(?:modify|preview|build).*(?:workspace|preview|environment)\b|\bonce\s+that'?s\s+enabled\b/i;

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

    if (WORKSPACE_UNAVAILABLE_RE.test(trimmed)) {
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

/** Soften draft/server-build errors for Preview / alerts (never raw WC / npm dumps). */
export function toFriendlyPreviewError(raw: string | undefined | null): string {
  const text = (raw || '').trim();

  if (!text) {
    return 'Something went wrong while preparing the preview. Try sending another message.';
  }

  if (/studio-linked session required/i.test(text)) {
    return 'Reconnect through Studio so we can build your preview on Indobase servers.';
  }

  if (/project incomplete/i.test(text)) {
    return 'The first pass did not finish a runnable project yet. Keep chatting — the agent will complete the files.';
  }

  if (/server build failed|command failed:.*\bbuild\b|npm run build/i.test(text)) {
    return 'The preview build hit an error in the generated app. The agent is fixing it — hang tight, or send a follow-up.';
  }

  if (/webcontainer|stackblitz|workspace isn'?t available/i.test(text)) {
    return 'Preview runs on Indobase servers. Retry the prompt if the canvas is still empty.';
  }

  // Keep short product-facing detail; drop huge compiler logs from the empty state.
  const firstLine = text.split('\n').map((line) => line.trim()).find(Boolean) || text;

  return firstLine.length > 220 ? `${firstLine.slice(0, 217).trim()}…` : firstLine;
}
