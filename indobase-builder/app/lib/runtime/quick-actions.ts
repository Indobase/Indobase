/**
 * Detection helpers shared by the streaming message parser and the
 * FallbackRecommendations UI so both agree on what counts as a renderable
 * recommendation chip.
 */

const SINGULAR_QUICK_ACTION_REGEX = /<bolt-quick-action\b[^>]*>[\s\S]*?<\/bolt-quick-action>/i;
const QUICK_ACTIONS_GROUP_REGEX = /<bolt-quick-actions>([\s\S]*?)<\/bolt-quick-actions>/i;

/** Mistaken model output: `<boltAction type="message">…</boltAction>` inside a quick-actions group. */
export const MISTAKEN_BOLT_ACTION_REGEX = /<boltAction\b([^>]*)>([\s\S]*?)<\/boltAction>/gi;

function isMessageTypeAttrs(tagAttrs: string): boolean {
  const typeMatch = tagAttrs.match(/type=["']?([^"'\s>]+)["']?/i);
  return !typeMatch || typeMatch[1].toLowerCase() === 'message';
}

/**
 * True only when the text contains chips the parser can actually render:
 * either properly formed singular `<bolt-quick-action>` tags, or mistaken
 * `<boltAction type="message">` tags inside a `<bolt-quick-actions>` group
 * (which the parser recovers into chips). A bare/empty plural wrapper does
 * NOT count — the fallback chips must show in that case.
 */
export function hasRenderableQuickActions(text: string): boolean {
  if (!text) {
    return false;
  }

  if (SINGULAR_QUICK_ACTION_REGEX.test(text)) {
    return true;
  }

  const group = text.match(QUICK_ACTIONS_GROUP_REGEX);

  if (!group) {
    return false;
  }

  MISTAKEN_BOLT_ACTION_REGEX.lastIndex = 0;

  let match;

  while ((match = MISTAKEN_BOLT_ACTION_REGEX.exec(group[1])) !== null) {
    if (isMessageTypeAttrs(match[1]) && (match[2].trim() || /message=/i.test(match[1]))) {
      return true;
    }
  }

  return false;
}
