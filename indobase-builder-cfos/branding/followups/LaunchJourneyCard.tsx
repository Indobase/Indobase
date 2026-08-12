/**
 * Naive-style launch ladder — visible progress + primary next action (not agent-only).
 * Persistent: singleton sticky card so operators always see account→…→production.
 */
import { memo, useEffect, useId, useState } from 'react'

import styles from './LaunchJourneyCard.module.css'

type LaunchJourneyStage = {
  id: string
  label: string
  status: 'done' | 'current' | 'upcoming'
}

type LaunchJourneyState = {
  guest: boolean
  live_url: string | null
  headline: string
  stages: LaunchJourneyStage[]
  next_action: { label: string; message: string } | null
}

export function readLaunchJourneyFromWindow(): LaunchJourneyState | null {
  try {
    const w = window as unknown as { __INDOBASE_JOURNEY__?: LaunchJourneyState | null }
    const journey = w.__INDOBASE_JOURNEY__
    return journey && typeof journey === 'object' ? journey : null
  } catch {
    return null
  }
}

const JOURNEY_CARD_ATTR = 'data-indobase-journey-card'

/**
 * Only the last mounted journey card in the chat tree should render —
 * keeps the ladder always visible without duplicating on every turn.
 */
function useJourneySingleton(instanceId: string): boolean {
  const [active, setActive] = useState(true)

  useEffect(() => {
    const refresh = () => {
      try {
        const nodes = Array.from(document.querySelectorAll(`[${JOURNEY_CARD_ATTR}]`))
        const last = nodes[nodes.length - 1] as HTMLElement | undefined
        setActive(Boolean(last && last.getAttribute(JOURNEY_CARD_ATTR) === instanceId))
      } catch {
        setActive(true)
      }
    }
    refresh()
    const t = window.setTimeout(refresh, 0)
    return () => {
      window.clearTimeout(t)
      // After unmount, promote the new last card.
      window.setTimeout(() => {
        try {
          document
            .querySelectorAll(`[${JOURNEY_CARD_ATTR}]`)
            .forEach((el) => el.dispatchEvent(new Event('indobase-journey-refresh')))
        } catch {
          /* ignore */
        }
      }, 0)
    }
  }, [instanceId])

  useEffect(() => {
    const onRefresh = () => {
      try {
        const nodes = Array.from(document.querySelectorAll(`[${JOURNEY_CARD_ATTR}]`))
        const last = nodes[nodes.length - 1] as HTMLElement | undefined
        setActive(Boolean(last && last.getAttribute(JOURNEY_CARD_ATTR) === instanceId))
      } catch {
        setActive(true)
      }
    }
    window.addEventListener('indobase-journey-refresh', onRefresh)
    return () => window.removeEventListener('indobase-journey-refresh', onRefresh)
  }, [instanceId])

  return active
}

export const LaunchJourneyCard = memo(function LaunchJourneyCard({
  onPick,
  disabled,
  sticky = true,
}: {
  onPick: (message: string) => void
  disabled?: boolean
  /** Sticky within chat scroll so progress stays in view (P2). */
  sticky?: boolean
}) {
  const instanceId = useId()
  const isActive = useJourneySingleton(instanceId)
  const journey = readLaunchJourneyFromWindow()
  if (!journey || journey.guest || !isActive) return null

  const { stages, next_action, headline, live_url } = journey

  return (
    <section
      className={[styles.root, sticky ? styles.sticky : ''].filter(Boolean).join(' ')}
      aria-label="Launch your business"
      data-indobase-journey-card={instanceId}
    >
      <div className={styles.header}>
        <div>
          <div className={styles.kicker}>Launch progress</div>
          <div className={styles.headline}>{headline}</div>
        </div>
        {live_url ? (
          <a className={styles.liveLink} href={live_url} target="_blank" rel="noreferrer">
            Open live site
          </a>
        ) : null}
      </div>
      <ol className={styles.steps}>
        {stages.map((step) => (
          <li
            key={step.id}
            className={[
              styles.step,
              step.status === 'done' ? styles.stepDone : '',
              step.status === 'current' ? styles.stepCurrent : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className={styles.stepDot} aria-hidden />
            <span className={styles.stepLabel}>{step.label}</span>
          </li>
        ))}
      </ol>
      {next_action ? (
        <button
          type="button"
          className={styles.primary}
          disabled={disabled}
          onClick={() => onPick(next_action.message)}
        >
          {next_action.label}
        </button>
      ) : null}
    </section>
  )
})
