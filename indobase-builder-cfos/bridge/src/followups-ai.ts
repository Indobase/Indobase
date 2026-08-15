/**
 * Contextual follow-up chips from the cheap org model + this chat.
 *
 * Operator chips must come from the conversation, not canned
 * APP_TYPE_FOLLOWUPS / ECOMMERCE_NICHE_FOLLOWUPS catalogs.
 */

import { failoverOrderForTask, CFOS_ORG_MODEL } from './cfos-model-policy.js'
import {
  MAX_VISIBLE_CHIPS,
  DEFAULT_POST_BUILD_TITLE,
  filterChipsForJourneyState,
  filterGuestClarifyingChips,
  looksLikeCannedCatalogChips,
  operatorChipLabel,
  sanitizeChipMessage,
  type FollowUpItem,
  type JourneyChipFlags,
  type ParsedFollowUps,
} from './followups.js'

export type FollowUpChatTurn = {
  role: 'user' | 'assistant'
  content: string
}

export type GenerateFollowUpsInput = {
  history?: FollowUpChatTurn[]
  assistantMessage?: string
  flags?: JourneyChipFlags | null
  fetchImpl?: typeof fetch
}

const SYSTEM = `You write 2 or 3 next-step chips for Indobase Builder.

Use ONLY the conversation. Customer language. No tool names, no PocketBase,
no Studio, no API paths, no <<<INDOBASE_FOLLOWUPS>>> markup.

Return JSON only:
{"title":"short question","items":[{"label":"chip","message":"what they would type next"}]}

Rules:
- Labels ≤ 36 characters.
- Messages are the operator's next send (plain English).
- Personalize from their prompt (brand, niche, what they asked to build).
- If they asked for a store/shop, never offer SaaS / blog / dashboard / landing as types.
- Guest/unsigned-in: clarifying chips only (what they sell, confirm the idea). Never Go Live, payments, or domain.
- After a preview: Launch / continue editing / a specific tweak from the chat.
- After live: domain / payments / checklist in business language.
- Never dump a generic 7-type app catalog or Apparel/Electronics/Food/Beauty unless they asked for those niches.`

const TIMEOUT_MS = 8000
const MAX_TURNS = 16
const MAX_CHARS = 1800

function openRouterKey(): string {
  return process.env.OPEN_ROUTER_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim() || ''
}

export function clipTurn(turn: FollowUpChatTurn): FollowUpChatTurn {
  const content = (turn.content || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS)
  return { role: turn.role === 'user' ? 'user' : 'assistant', content }
}

export function normalizeFollowUpHistory(
  history: FollowUpChatTurn[] | undefined,
  assistantMessage?: string,
): FollowUpChatTurn[] {
  const out: FollowUpChatTurn[] = []
  for (const raw of history || []) {
    if (!raw || typeof raw.content !== 'string') continue
    const clipped = clipTurn(raw)
    if (!clipped.content) continue
    out.push(clipped)
  }
  const assistant = (assistantMessage || '').trim()
  if (assistant) {
    const last = out[out.length - 1]
    if (!last || last.role !== 'assistant' || last.content !== assistant.slice(0, MAX_CHARS)) {
      out.push(clipTurn({ role: 'assistant', content: assistant }))
    }
  }
  return out.slice(-MAX_TURNS)
}

export function parseGeneratedFollowUpsJson(raw: string): { title: string; items: FollowUpItem[] } | null {
  if (!raw?.trim()) return null
  let t = raw.trim()
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t)
  if (fence?.[1]) t = fence[1].trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let obj: unknown
  try {
    obj = JSON.parse(t.slice(start, end + 1))
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object') return null
  const rec = obj as { title?: unknown; items?: unknown }
  const title =
    typeof rec.title === 'string' && rec.title.trim() ? rec.title.trim().slice(0, 80) : DEFAULT_POST_BUILD_TITLE
  if (!Array.isArray(rec.items)) return null
  const items: FollowUpItem[] = []
  for (const row of rec.items) {
    if (!row || typeof row !== 'object') continue
    const r = row as { label?: unknown; message?: unknown }
    const label = operatorChipLabel(typeof r.label === 'string' ? r.label : '')
    if (!label || label.length > 48) continue
    const message = sanitizeChipMessage(typeof r.message === 'string' ? r.message : label, label)
    if (!message) continue
    items.push({ label, message })
    if (items.length >= MAX_VISIBLE_CHIPS) break
  }
  if (items.length < 2) return null
  return { title, items }
}

function historyMentionsStore(turns: FollowUpChatTurn[]): boolean {
  const blob = turns.map((t) => t.content).join('\n').toLowerCase()
  return /\b(store|shop|ecommerce|e-commerce|cart|checkout|sell)\b/.test(blob)
}

function dropGenericAppTypesForStore(items: FollowUpItem[], turns: FollowUpChatTurn[]): FollowUpItem[] {
  if (!historyMentionsStore(turns)) return items
  return items.filter(
    (i) => !/saas|blog|dashboard|landing \/ marketing|internal tool/i.test(`${i.label} ${i.message}`),
  )
}

async function completeOpenRouter(input: {
  userPayload: string
  fetchImpl?: typeof fetch
}): Promise<string | null> {
  const key = openRouterKey()
  if (!key || key.length < 20) return null
  const doFetch = input.fetchImpl || fetch
  const models = failoverOrderForTask('org')
  for (const model of models.length ? models : [CFOS_ORG_MODEL]) {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
    try {
      const res = await doFetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://builder.indobase.in',
          'X-Title': 'Indobase Builder',
        },
        body: JSON.stringify({
          model,
          temperature: 0.35,
          max_tokens: 420,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: input.userPayload },
          ],
        }),
        signal: ac.signal,
      })
      if (!res.ok) continue
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>
      }
      const content = json?.choices?.[0]?.message?.content
      if (typeof content === 'string' && content.trim()) return content
    } catch {
      /* try next model */
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}

function finishChips(
  title: string,
  items: FollowUpItem[],
  flags?: JourneyChipFlags | null,
): ParsedFollowUps | null {
  let parsed: ParsedFollowUps = { body: '', title, items }
  parsed = flags?.isGuest ? filterGuestClarifyingChips(parsed) : parsed
  parsed = filterChipsForJourneyState(parsed, flags)
  parsed = {
    ...parsed,
    items: parsed.items.map((item) => ({
      label: operatorChipLabel(item.label, flags?.appKind),
      message: sanitizeChipMessage(item.message, item.label),
    })),
  }
  if (!parsed.items.length || looksLikeCannedCatalogChips(parsed.items)) return null
  return parsed
}

/**
 * Ask the org-tier model for 2–3 chips from this conversation.
 * Returns null when the key is missing, the model fails, or output is unsafe.
 */
export async function generateContextualFollowUps(
  input: GenerateFollowUpsInput,
): Promise<ParsedFollowUps | null> {
  const history = normalizeFollowUpHistory(input.history, input.assistantMessage)
  if (!history.length) return null

  const payload = JSON.stringify({
    conversation: history,
    guest: Boolean(input.flags?.isGuest),
    live: Boolean(input.flags?.isLive),
    preview_ready: Boolean(input.flags?.previewReady),
    spec_ready: Boolean(input.flags?.specReady),
    app_kind: input.flags?.appKind || null,
  })

  const raw = await completeOpenRouter({ userPayload: payload, fetchImpl: input.fetchImpl })
  const parsed = parseGeneratedFollowUpsJson(raw || '')
  if (!parsed) return null
  parsed.items = dropGenericAppTypesForStore(parsed.items, history)
  if (parsed.items.length < 2) return null
  return finishChips(parsed.title, parsed.items, input.flags)
}
