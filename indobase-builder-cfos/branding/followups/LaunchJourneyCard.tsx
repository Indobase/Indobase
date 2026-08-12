/**
 * Naive-style launch ladder — visible progress + primary next action (not agent-only).
 */
import { memo } from 'react'

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

export const LaunchJourneyCard = memo(function LaunchJourneyCard({
  onPick,
  disabled,
}: {
  onPick: (message: string) => void
  disabled?: boolean
}) {
  const journey = readLaunchJourneyFromWindow()
  if (!journey || journey.guest) return null

  const { stages, next_action, headline, live_url } = journey

  return (
    <section className={styles.root} aria-label="Launch your business">
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
