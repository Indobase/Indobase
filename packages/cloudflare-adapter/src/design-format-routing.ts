/**
 * Deterministic Design format routing for Builder Gen 3.
 *
 * Logo / social / poster / graphic intents must open `format.design`
 * (never Slides, never a scratch HTML gadget).
 */

export const DESIGN_FORMAT_BLUEPRINT_ID = 'format.design' as const

/** Keywords / phrases that MUST map to Design (case-insensitive). */
export const DESIGN_FORMAT_INTENT_KEYWORDS = [
  'logo',
  'logotype',
  'wordmark',
  'brand mark',
  'instagram',
  'insta post',
  'ig post',
  'ig story',
  'linkedin post',
  'facebook post',
  'social post',
  'social media',
  'story',
  'stories',
  'poster',
  'flyer',
  'flier',
  'banner',
  'graphic design',
  'graphic',
  'creative',
  'creatives',
  'thumbnail',
  'cover image',
  'square post',
  'carousel cover',
] as const

/** Hard rules for agent system / session hints (keep under AdminConfig MAX_AGENT_HINT when sliced). */
export const DESIGN_FORMAT_ROUTING_RULES = [
  `ALWAYS use Design format (blueprintId ${DESIGN_FORMAT_BLUEPRINT_ID}) for logos, Instagram/LinkedIn/Facebook posts and stories, posters, flyers, banners, thumbnails, and any graphic/creative design request.`,
  `NEVER use Slides (format.slides), Docs, Sheets, a random gadget, or a hand-written HTML mock for those intents — instantiate ${DESIGN_FORMAT_BLUEPRINT_ID} with createGadget({ blueprintId: "${DESIGN_FORMAT_BLUEPRINT_ID}" }).`,
  'After creating Design, call setPreset (logo | ig-post | story | poster) and setTitle from the user request; edit layers via executeCode RPC, do not rewrite client.js for content.',
].join(' ')

/** Per-format AdminConfig.agentHint lines (≤400 chars each). */
export const STANDARD_FORMAT_AGENT_HINTS: Record<string, string> = {
  'format.document':
    'Prefer for written documents, memos, contracts, and long-form text — not single-image graphics.',
  'format.spreadsheet':
    'Prefer for spreadsheets, tables, budgets, and numeric trackers.',
  'format.slides':
    'Prefer for multi-slide decks/presentations only. NEVER for logos, social posts, stories, posters, flyers, banners, or single-image graphics — use Design (format.design).',
  'format.design':
    'ALWAYS for logos, Instagram/LinkedIn/Facebook posts & stories, posters, flyers, banners, thumbnails, graphic design, creatives. NEVER Slides or HTML mocks. createGadget blueprintId format.design; then setPreset.',
}

/** Instance instructions appendix for AdminConfig.instanceInstructions. */
export const DESIGN_FORMAT_INSTANCE_INSTRUCTIONS = `# Indobase format routing (mandatory)

${DESIGN_FORMAT_ROUTING_RULES}

Standard blueprintIds:
* Docs — format.document
* Sheets — format.spreadsheet
* Slides — format.slides (decks only)
* Design — format.design (logos / social / posters / graphics)
`

export function promptLooksLikeDesignIntent(prompt: string): boolean {
  const text = String(prompt || '').toLowerCase()
  if (!text.trim()) return false
  return DESIGN_FORMAT_INTENT_KEYWORDS.some((kw) => text.includes(kw))
}

/** Map a user prompt to a preferred Design canvas preset when obvious. */
export function inferDesignPresetFromPrompt(
  prompt: string,
): 'logo' | 'ig-post' | 'story' | 'poster' | null {
  const text = String(prompt || '').toLowerCase()
  if (!text.trim()) return null
  if (/\b(logo|logotype|wordmark|brand\s*mark)\b/.test(text)) return 'logo'
  if (/\b(story|stories|reel)\b/.test(text) || /\big\s*story\b/.test(text)) return 'story'
  if (/\b(poster|flyer|flier|banner)\b/.test(text)) return 'poster'
  if (
    /\b(instagram|linkedin|facebook|social|ig\s*post|thumbnail|graphic|creative)\b/.test(text)
  ) {
    return 'ig-post'
  }
  if (promptLooksLikeDesignIntent(text)) return 'ig-post'
  return null
}

export function preferredFormatForPrompt(prompt: string): typeof DESIGN_FORMAT_BLUEPRINT_ID | null {
  return promptLooksLikeDesignIntent(prompt) ? DESIGN_FORMAT_BLUEPRINT_ID : null
}
