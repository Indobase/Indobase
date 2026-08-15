/**
 * Follow-up / clarifying choice chips (competitor-style guided next steps).
 * Copied into CFOS workshop-frontend by rebrand-cloudflare-os.mjs.
 */
import { memo, useEffect, useId, useMemo, useState, type ReactNode } from 'react'

import {
  parseFollowUps,
  resolveFollowUps,
  cleanOperatorMessage,
  stripFollowUpsMarkup,
  formatFollowUpsBlock,
  shouldShowLaunchJourneyCard,
  inferChipStage,
  filterGuestClarifyingChips,
  looksLikeCannedAppTypeCatalog,
  type FollowUpItem,
  type JourneyChipFlags,
  type ParsedFollowUps,
} from './followups'

import { ExecutionCard } from './ExecutionCard'
import { LaunchJourneyCard, readLaunchJourneyFromWindow } from './LaunchJourneyCard'
import {
  composePresentation,
  hostedSiteUrlFromOperatorMessage,
  pickOperatorMessage,
  type PresentationSurface,
  type RuntimeView,
} from './presentation'

import styles from './FollowUpRecommendations.module.css'

export {
  parseFollowUps,
  resolveFollowUps,
  DEFAULT_POST_BUILD_FOLLOWUPS,
  DEFAULT_POST_BUILD_TITLE,
} from './followups'
export type { FollowUpItem, ParsedFollowUps }

function isBrowserGuestSession(): boolean {
  try {
    const w = window as unknown as {
      __INDOBASE_SESSION_STAGE__?: string
      __INDOBASE_GUEST__?: boolean
      __INDOBASE__?: { guest?: boolean } | null
      __INDOBASE_JOURNEY__?: { guest?: boolean; flags?: { is_guest?: boolean } } | null
    }
    if (w.__INDOBASE_SESSION_STAGE__ === 'member' || w.__INDOBASE_GUEST__ === false) return false
    if (w.__INDOBASE_SESSION_STAGE__ === 'guest') return true
    if (w.__INDOBASE_GUEST__ === true) return true
    if (w.__INDOBASE__ && typeof w.__INDOBASE__ === 'object' && w.__INDOBASE__.guest === true) {
      return true
    }
    if (w.__INDOBASE_JOURNEY__?.guest || w.__INDOBASE_JOURNEY__?.flags?.is_guest) return true
  } catch {
    /* ignore */
  }
  return false
}

function readPresentation(): PresentationSurface | null {
  try {
    const w = window as unknown as { __INDOBASE_UX__?: PresentationSurface; __INDOBASE_RUNTIME__?: RuntimeView }
    if (w.__INDOBASE_UX__?.lifecycle) return w.__INDOBASE_UX__
    if (w.__INDOBASE_RUNTIME__?.business) return composePresentation(w.__INDOBASE_RUNTIME__)
  } catch {
    /* ignore */
  }
  return null
}

function readRuntimeSpec(): {
  specReady: boolean
  verticalId: string | null
  previewReady: boolean
} {
  try {
    const r = (window as unknown as { __INDOBASE_RUNTIME__?: RuntimeView }).__INDOBASE_RUNTIME__
    const name = String(r?.spec?.businessName || r?.business?.name || '').trim()
    const placeholder = !name || /^your business$/i.test(name)
    const verticalId = r?.spec?.verticalId || null
    return {
      specReady: Boolean(!placeholder && name),
      verticalId,
      previewReady: r?.preview?.status === 'ready',
    }
  } catch {
    return { specReady: false, verticalId: null, previewReady: false }
  }
}

function readProjectState(): string | null {
  try {
    const state = (window as unknown as { __INDOBASE_PROJECT__?: { state?: string } | null })
      .__INDOBASE_PROJECT__?.state
    return typeof state === 'string' && state.trim() ? state.trim() : null
  } catch {
    return null
  }
}

const CHIP_HOST_ATTR = 'data-indobase-chip-host'

type ChatTurn = { role: 'user' | 'assistant'; content: string }

function readWindowTurns(): ChatTurn[] {
  try {
    const raw = (window as unknown as { __INDOBASE_CHAT_TURNS__?: unknown }).__INDOBASE_CHAT_TURNS__
    if (!Array.isArray(raw)) return []
    return raw
      .filter(
        (row): row is ChatTurn =>
          Boolean(row) &&
          typeof row === 'object' &&
          (row.role === 'user' || row.role === 'assistant') &&
          typeof row.content === 'string' &&
          row.content.trim().length > 0,
      )
      .map((row) => ({ role: row.role, content: row.content.slice(0, 1800) }))
      .slice(-16)
  } catch {
    return []
  }
}

function rememberChatTurn(role: ChatTurn['role'], content: string) {
  const text = (content || '').trim()
  if (!text) return
  try {
    const w = window as unknown as { __INDOBASE_CHAT_TURNS__?: ChatTurn[] }
    const prev = Array.isArray(w.__INDOBASE_CHAT_TURNS__) ? w.__INDOBASE_CHAT_TURNS__ : []
    const last = prev[prev.length - 1]
    const clipped = { role, content: text.slice(0, 1800) }
    if (last && last.role === role && last.content === clipped.content) {
      w.__INDOBASE_CHAT_TURNS__ = prev.slice(-16)
      return
    }
    w.__INDOBASE_CHAT_TURNS__ = [...prev, clipped].slice(-16)
  } catch {
    /* ignore */
  }
}

function historyForFollowUps(assistantBody: string, extra?: ChatTurn[]): ChatTurn[] {
  const fromWindow = readWindowTurns() || []
  const merged = [...fromWindow, ...(extra || [])]
  const assistant = (assistantBody || '').trim()
  if (assistant) {
    const last = merged[merged.length - 1]
    if (!last || last.role !== 'assistant' || last.content !== assistant.slice(0, 1800)) {
      merged.push({ role: 'assistant', content: assistant.slice(0, 1800) })
    }
  }
  return merged.slice(-16)
}

/** Only the latest assistant turn shows chips — older turns keep the prose. */
function useLatestChipHost(instanceId: string): boolean {
  const [active, setActive] = useState(true)

  useEffect(() => {
    const refresh = () => {
      try {
        const nodes = Array.from(document.querySelectorAll(`[${CHIP_HOST_ATTR}]`))
        const last = nodes[nodes.length - 1] as HTMLElement | undefined
        setActive(Boolean(last && last.getAttribute(CHIP_HOST_ATTR) === instanceId))
      } catch {
        setActive(true)
      }
    }
    refresh()
    const t = window.setTimeout(refresh, 0)
    return () => {
      window.clearTimeout(t)
      window.setTimeout(() => {
        try {
          document
            .querySelectorAll(`[${CHIP_HOST_ATTR}]`)
            .forEach((el) => el.dispatchEvent(new Event('indobase-chip-refresh')))
        } catch {
          /* ignore */
        }
      }, 0)
    }
  }, [instanceId])

  useEffect(() => {
    const onRefresh = () => {
      try {
        const nodes = Array.from(document.querySelectorAll(`[${CHIP_HOST_ATTR}]`))
        const last = nodes[nodes.length - 1] as HTMLElement | undefined
        setActive(Boolean(last && last.getAttribute(CHIP_HOST_ATTR) === instanceId))
      } catch {
        setActive(true)
      }
    }
    window.addEventListener('indobase-chip-refresh', onRefresh)
    return () => window.removeEventListener('indobase-chip-refresh', onRefresh)
  }, [instanceId])

  return active
}

export const FollowUpChipGrid = memo(function FollowUpChipGrid({
  title,
  items,
  onPick,
  disabled,
}: {
  title: string
  items: readonly FollowUpItem[]
  onPick: (message: string) => void
  disabled?: boolean
}) {
  const [pickedKey, setPickedKey] = useState<string | null>(null)

  // New chip set (new agent turn) → allow picks again.
  useEffect(() => {
    setPickedKey(null)
  }, [title, items])

  if (!items.length) return null

  const locked = Boolean(disabled || pickedKey)

  return (
    <div className={styles.root} role="region" aria-label={title}>
      <div className={styles.title}>{title}</div>
      <div className={styles.grid}>
        {items.map((item) => {
          const key = `${item.label}::${item.message}`
          return (
            <button
              key={key}
              type="button"
              className={styles.chip}
              disabled={locked}
              onClick={() => {
                if (locked) return
                if (hostedSiteUrlFromOperatorMessage(item.message, typeof window !== 'undefined' ? window.location.origin : '')) {
                  pickOperatorMessage(item.message, onPick)
                  return
                }
                setPickedKey(key)
                onPick(item.message)
              }}
            >
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  )
})

type Props = {
  message: string
  /**
   * Recent user/assistant turns from ChatInterface. When omitted, the UI
   * uses window.__INDOBASE_CHAT_TURNS__ (filled on send).
   */
  history?: ChatTurn[]
  /**
   * When true (default), run resolveFollowUps (agent blocks + deliverable fallback).
   * When false, parseFollowUps only (no stage gate / injection).
   */
  allowFallback?: boolean
  /** When true, prefer showing journey on this turn; singleton still keeps one sticky card. */
  showLaunchJourney?: boolean
  onPick: (message: string) => void
  disabled?: boolean
  /** Render markdown (or other) body with the stripped message. */
  children?: (body: string, followUps: ParsedFollowUps | null) => ReactNode
}

/**
 * Splits agent text into markdown body + chip grid.
 * Chips prefer AI + chat history (POST /api/os/tools/followups).
 * Canned app-type catalogs are hidden. Markup is never shown in markdown.
 */
export const FollowUpRecommendations = memo(function FollowUpRecommendations({
  message,
  history,
  allowFallback = true,
  showLaunchJourney = true,
  onPick,
  disabled,
  children,
}: Props) {
  const instanceId = useId()
  const isLatest = useLatestChipHost(instanceId)
  const fromRaw = useMemo(() => parseFollowUps(message), [message])
  const cleaned = useMemo(
    () => cleanOperatorMessage(fromRaw?.body ?? stripFollowUpsMarkup(message)),
    [fromRaw, message],
  )
  const journeyOpts = useMemo(() => {
    const journey = readLaunchJourneyFromWindow()
    const guest = isBrowserGuestSession() || Boolean(journey?.guest || journey?.flags?.is_guest)
    const projectState = readProjectState()
    const liveUrl = journey?.live_url || null
    const isLive =
      !guest &&
      (projectState === 'live' ||
        (!projectState && Boolean(journey?.flags?.is_live && liveUrl)))
    const spec = readRuntimeSpec()
    const journeyFlags: JourneyChipFlags = {
      isGuest: guest,
      isLive,
      isBackendReady: Boolean(journey?.flags?.is_backend_ready || journey?.backend_ready),
      isPaymentsReady: Boolean(journey?.flags?.is_payments_ready || journey?.payments_ready),
      liveUrl,
      projectState,
      appKind: journey?.flags?.app_kind,
      specReady: spec.specReady,
      verticalId: spec.verticalId,
      previewReady: spec.previewReady || Boolean(journey?.flags?.is_backend_ready && !isLive),
    }
    if (!journey && !guest && !projectState && !spec.specReady) return undefined
    return {
      journeyNextAction:
        !guest && journey?.next_action?.label
          ? {
              label: journey.next_action.label,
              message: journey.next_action.message || journey.next_action.label,
            }
          : null,
      journeyHeadline: journey?.headline || null,
      journeyIsLive: isLive,
      journeyLiveUrl: liveUrl,
      journeyFlags,
    }
  }, [cleaned])
  const resolved = useMemo(() => {
    const forResolve =
      fromRaw && fromRaw.items.length > 0
        ? `${cleaned}\n\n${formatFollowUpsBlock(fromRaw.title, fromRaw.items)}`
        : cleaned
    const explicit =
      fromRaw && fromRaw.items.length > 0 ? { ...fromRaw, body: cleaned } : parseFollowUps(cleaned)
    const raw = allowFallback
      ? resolveFollowUps(forResolve, journeyOpts)
      : explicit ??
        (journeyOpts?.journeyNextAction
          ? resolveFollowUps(forResolve, journeyOpts)
          : null)
    if (!raw) return null
    const guest = Boolean(journeyOpts?.journeyFlags?.isGuest || isBrowserGuestSession())
    if (guest || inferChipStage(cleaned) === 'guest_gate') {
      const clarifying = filterGuestClarifyingChips(raw)
      if (looksLikeCannedAppTypeCatalog(clarifying.items)) {
        return { ...clarifying, items: [] as FollowUpItem[] }
      }
      return clarifying
    }
    if (looksLikeCannedAppTypeCatalog(raw.items)) {
      return { ...raw, items: [] as FollowUpItem[] }
    }
    return raw
  }, [allowFallback, cleaned, fromRaw, journeyOpts])
  const [aiFollowUps, setAiFollowUps] = useState<ParsedFollowUps | null>(null)
  const [aiAttempted, setAiAttempted] = useState(false)

  useEffect(() => {
    if (!isLatest || disabled || !allowFallback) return
    rememberChatTurn('assistant', cleaned)
    let cancelled = false
    setAiAttempted(false)
    setAiFollowUps(null)
    const turns = historyForFollowUps(cleaned, history)
    const flags = journeyOpts?.journeyFlags || { isGuest: isBrowserGuestSession() }
    void (async () => {
      try {
        const res = await fetch('/api/os/tools/followups', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            message,
            history: turns,
            generate: true,
            journey_headline: journeyOpts?.journeyHeadline ?? null,
            journey_next_action: journeyOpts?.journeyNextAction ?? null,
            journey_flags: flags,
          }),
        })
        if (!res.ok) throw new Error('followups failed')
        const json = (await res.json()) as {
          generated?: ParsedFollowUps | null
          followups?: ParsedFollowUps | null
          source?: string | null
        }
        if (cancelled) return
        const next = json.generated || (json.source === 'ai' ? json.followups : null)
        if (next?.items?.length && !looksLikeCannedAppTypeCatalog(next.items)) {
          setAiFollowUps({ ...next, body: cleaned })
        }
      } catch {
        /* keep deterministic fallback */
      } finally {
        if (!cancelled) setAiAttempted(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [allowFallback, cleaned, disabled, history, isLatest, journeyOpts, message])

  const display = useMemo(() => {
    if (aiFollowUps?.items.length) return aiFollowUps
    if (!aiAttempted) {
      return resolved ? { ...resolved, items: [] as FollowUpItem[] } : null
    }
    if (resolved && looksLikeCannedAppTypeCatalog(resolved.items)) {
      return { ...resolved, items: [] as FollowUpItem[] }
    }
    return resolved
  }, [aiAttempted, aiFollowUps, resolved])

  const body = display?.body ?? resolved?.body ?? cleaned
  const surface = useMemo(() => readPresentation(), [cleaned])
  const showJourney =
    showLaunchJourney &&
    isLatest &&
    shouldShowLaunchJourneyCard({
      isGuest: isBrowserGuestSession(),
      chipStage: inferChipStage(cleaned),
    })

  return (
    <div data-indobase-chip-host={instanceId}>
      {children ? children(body, display) : null}
      {isLatest && surface?.executionCard ? (
        <ExecutionCard card={surface.executionCard} stream={surface.stream} />
      ) : null}
      {showJourney && <LaunchJourneyCard onPick={onPick} disabled={disabled} sticky />}
      {isLatest && display && display.items.length > 0 && (
        <FollowUpChipGrid
          title={display.title}
          items={display.items}
          onPick={(next) => {
            rememberChatTurn('user', next)
            onPick(next)
          }}
          disabled={disabled}
        />
      )}
    </div>
  )
})
