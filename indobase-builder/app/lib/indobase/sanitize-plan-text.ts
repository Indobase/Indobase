/**
 * Strip internal routing / tool noise from user-facing BUILD PLAN and chat text.
 * Model and provider ids must never appear in Builder UI (server-side routing only).
 */

const MODEL_ANNOTATION_RE = /\[Model:\s*[^\]]*\]/gi;
const PROVIDER_ANNOTATION_RE = /\[Provider:\s*[^\]]*\]/gi;

/** Lines that are tool/schema/runtime errors, not product plan steps. */
const JUNK_PLAN_STEP_RE =
  /^(?:the\s+["']?path["']?\s+argument\s+must\s+be|typeerror\b|error:\s|ai_nosuchtoolerror|toolinvocation\s+must\s+have|econnrefused|enotfound|etimedout|enoent\b|invalid\s+authentication|failed\s+to\s+decrypt)/i;

export function stripInternalRoutingAnnotations(text: string): string {
  return text
    .replace(MODEL_ANNOTATION_RE, '')
    .replace(PROVIDER_ANNOTATION_RE, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extra scrubbing for BUILD PLAN checklist lines only — never show provider/model ids or
 * OpenRouter brand even if a planner echoed them outside the [Model]/[Provider] wrappers.
 */
export function scrubPlanStepInternals(text: string): string {
  return stripInternalRoutingAnnotations(text)
    .replace(/\bqwen\/[^\s\]`'"]+/gi, '')
    .replace(/\bdeepseek\/[^\s\]`'"]+/gi, '')
    .replace(/\bopenai\/gpt-[^\s\]`'"]+/gi, '')
    .replace(/\bopenrouter\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Collapse user prompt text for embedding into instant plans (single line, no annotations). */
export function cleanUserPromptForPlan(text: string, maxLen = 200): string {
  const cleaned = stripInternalRoutingAnnotations(text)
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return '';
  }

  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) : cleaned;
}

export function isJunkPlanStep(step: string): boolean {
  const trimmed = step.trim();

  if (!trimmed) {
    return true;
  }

  if (MODEL_ANNOTATION_RE.test(trimmed) || PROVIDER_ANNOTATION_RE.test(trimmed)) {
    // Reset lastIndex — these are global regexes.
    MODEL_ANNOTATION_RE.lastIndex = 0;
    PROVIDER_ANNOTATION_RE.lastIndex = 0;
    return true;
  }

  MODEL_ANNOTATION_RE.lastIndex = 0;
  PROVIDER_ANNOTATION_RE.lastIndex = 0;

  if (/^\[?(?:Model|Provider)\s*:/i.test(trimmed)) {
    return true;
  }

  if (JUNK_PLAN_STEP_RE.test(trimmed)) {
    return true;
  }

  // Autonomy checklist / internal prompt fragments that sometimes leak via naive line splits.
  if (/^autonomy checklist\b/i.test(trimmed) || /^-\s*\[[ x]\]/i.test(trimmed)) {
    return true;
  }

  // Leftover "Implement:" after model annotation scrubbing.
  if (/^implement:?$/i.test(trimmed)) {
    return true;
  }

  return false;
}

export function sanitizePlanSteps(steps: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of steps) {
    const step = scrubPlanStepInternals(raw);

    if (!step || isJunkPlanStep(step) || seen.has(step.toLowerCase())) {
      continue;
    }

    seen.add(step.toLowerCase());
    out.push(step);
  }

  return out.slice(0, 7);
}
