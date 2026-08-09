/**
 * Follow-up / clarifying choice chips (competitor-style guided next steps).
 * Copied into CFOS workshop-frontend by rebrand-cloudflare-os.mjs.
 */
import { memo, useMemo, type ReactNode } from 'react'

import {
  parseFollowUps,
  resolveFollowUps,
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
  if (!items.length) return null

  return (
    <div className={styles.root} role="region" aria-label={title}>
      <div className={styles.title}>{title}</div>
      <div className={styles.grid}>
        {items.map((item) => (
          <button
            key={`${item.label}::${item.message}`}
            type="button"
            className={styles.chip}
            disabled={disabled}
            onClick={() => onPick(item.message)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
})

type Props = {
  message: string
  /**
   * When true (default), run resolveFollowUps (agent blocks + strip bad early walls).
   * When false, parseFollowUps only (no strip heuristics).
   * Neither mode invents predetermined catalogs.
   */
  allowFallback?: boolean
  onPick: (message: string) => void
  disabled?: boolean
  /** Render markdown (or other) body with the stripped message. */
  children?: (body: string, followUps: ParsedFollowUps | null) => ReactNode
}

/**
 * Splits agent text into markdown body + chip grid.
 * Chips come only from agent FOLLOWUPS/CHOICES blocks.
 */
export const FollowUpRecommendations = memo(function FollowUpRecommendations({
  message,
  allowFallback = true,
  onPick,
  disabled,
  children,
}: Props) {
  const resolved = useMemo(
    () => (allowFallback ? resolveFollowUps(message) : parseFollowUps(message)),
    [allowFallback, message],
  )
  const body = resolved?.body ?? message

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
