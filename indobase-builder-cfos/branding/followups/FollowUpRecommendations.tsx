/**
 * Follow-up / clarifying choice chips (competitor-style guided next steps).
 * Copied into CFOS workshop-frontend by rebrand-cloudflare-os.mjs.
 */
import { memo, useEffect, useMemo, useState, type ReactNode } from 'react'

import {
  parseFollowUps,
  resolveFollowUps,
  stripLeakedCot,
  type FollowUpItem,
  type ParsedFollowUps,
} from './followups'

import styles from './FollowUpRecommendations.module.css'

export {
  parseFollowUps,
  resolveFollowUps,
  DEFAULT_POST_BUILD_FOLLOWUPS,
  DEFAULT_POST_BUILD_TITLE,
} from './followups'
export type { FollowUpItem, ParsedFollowUps }

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
  onPick: (message: string) => void
  disabled?: boolean
  /** Render markdown (or other) body with the stripped message. */
  children?: (body: string, followUps: ParsedFollowUps | null) => ReactNode
}

/**
 * Splits agent text into markdown body + chip grid.
 * Chips come from agent FOLLOWUPS/CHOICES, or Naive deliverable fallback.
 */
export const FollowUpRecommendations = memo(function FollowUpRecommendations({
  message,
  allowFallback = true,
  onPick,
  disabled,
  children,
}: Props) {
  const cleaned = useMemo(() => stripLeakedCot(message), [message])
  const resolved = useMemo(
    () => (allowFallback ? resolveFollowUps(cleaned) : parseFollowUps(cleaned)),
    [allowFallback, cleaned],
  )
  const body = resolved?.body ?? cleaned

  return (
    <>
      {children ? children(body, resolved) : null}
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
