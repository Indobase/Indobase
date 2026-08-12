/**
 * Follow-up / clarifying choice chips (competitor-style guided next steps).
 * Copied into CFOS workshop-frontend by rebrand-cloudflare-os.mjs.
 */
import { memo, useEffect, useMemo, useState, type ReactNode } from 'react'

import {
  inferChipStage,
  parseFollowUps,
  resolveFollowUps,
  cleanOperatorMessage,
  type FollowUpItem,
  type ParsedFollowUps,
} from './followups'

import { LaunchJourneyCard, readLaunchJourneyFromWindow } from './LaunchJourneyCard'

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
      __INDOBASE__?: { guest?: boolean } | null
    }
    if (w.__INDOBASE_SESSION_STAGE__ === 'guest') return true
    if (w.__INDOBASE__ && typeof w.__INDOBASE__ === 'object' && (w.__INDOBASE__ as { guest?: boolean }).guest === true) {
      return true
    }
  } catch {
    /* ignore */
  }
  return false
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
   * When true (default), run resolveFollowUps (agent blocks + deliverable fallback).
   * When false, parseFollowUps only (no stage gate / injection).
   */
  allowFallback?: boolean
  /** When true, show the Naive-style launch progress card (latest completed turn only). */
  showLaunchJourney?: boolean
  onPick: (message: string) => void
  disabled?: boolean
  /** Render markdown (or other) body with the stripped message. */
  children?: (body: string, followUps: ParsedFollowUps | null) => ReactNode
}

/**
 * Splits agent text into markdown body + chip grid.
 * Chips come from agent FOLLOWUPS/CHOICES, or Naive deliverable fallback.
 * Never show chips during guest/auth turns (even if the agent emits CHOICES).
 */
export const FollowUpRecommendations = memo(function FollowUpRecommendations({
  message,
  allowFallback = true,
  showLaunchJourney = false,
  onPick,
  disabled,
  children,
}: Props) {
  const cleaned = useMemo(() => cleanOperatorMessage(message), [message])
  const journeyOpts = useMemo(() => {
    const journey = readLaunchJourneyFromWindow()
    if (!journey?.next_action?.label || journey.guest) return undefined
    return {
      journeyNextAction: journey.next_action,
      journeyHeadline: journey.headline,
    }
  }, [cleaned])
  const resolved = useMemo(() => {
    // Agent-authored FOLLOWUPS blocks can appear before the turn is marked complete.
    const explicit = parseFollowUps(cleaned)
    const raw = allowFallback
      ? resolveFollowUps(cleaned, journeyOpts)
      : explicit ??
        (journeyOpts?.journeyNextAction
          ? resolveFollowUps(cleaned, journeyOpts)
          : null)
    if (!raw) return null
    // Defense in depth: hide chips while unsigned-in / auth ask.
    if (isBrowserGuestSession() || inferChipStage(cleaned) === 'guest_gate') {
      return { ...raw, title: '', items: [] as FollowUpItem[] }
    }
    return raw
  }, [allowFallback, cleaned, journeyOpts])
  const body = resolved?.body ?? cleaned

  return (
    <>
      {children ? children(body, resolved) : null}
      {showLaunchJourney && !isBrowserGuestSession() && (
        <LaunchJourneyCard onPick={onPick} disabled={disabled} />
      )}
      {resolved && resolved.items.length > 0 && (
        <FollowUpChipGrid
          title={resolved.title}
          items={resolved.items}
          onPick={onPick}
          disabled={disabled}
        />
      )}
    </>
  )
})
