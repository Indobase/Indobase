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
  flags?: {
    is_guest?: boolean
    is_backend_ready?: boolean
    is_live?: boolean
    is_payments_ready?: boolean
    is_production_ready?: boolean
  }
}

type ProductionJobStage = {
  id: string
  title?: string
  status: 'pending' | 'running' | 'ok' | 'skipped' | 'failed'
  message?: string
}

type ProductionJobSnapshot = {
  jobId: string
  status: string
  appType?: string
  claim_live?: boolean
  url?: string | null
  stages?: ProductionJobStage[]
  failures?: Array<{ code?: string; message?: string; repair_hint?: string }>
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

export function readProductionJobFromWindow(): ProductionJobSnapshot | null {
  try {
    const w = window as unknown as { __INDOBASE_PRODUCTION_JOB__?: ProductionJobSnapshot | null }
    const job = w.__INDOBASE_PRODUCTION_JOB__
    return job && typeof job === 'object' && typeof job.jobId === 'string' ? job : null
  } catch {
    return null
  }
}

function jobToJourney(job: ProductionJobSnapshot): LaunchJourneyState {
  const stages =
    job.stages?.map((s) => ({
      id: s.id,
      label: s.title || s.id,
      status:
        s.status === 'ok' || s.status === 'skipped'
          ? ('done' as const)
          : s.status === 'running' || s.status === 'failed'
            ? ('current' as const)
            : ('upcoming' as const),
    })) || []
  const live = job.status === 'live' && job.url ? job.url : null
  const blocked = job.status === 'blocked'
  const lastFail = job.failures?.[job.failures.length - 1]
  const noun = job.appType === 'landing' ? 'website' : job.appType === 'saas' ? 'app' : 'store'
  return {
    guest: false,
    live_url: live,
    headline: blocked
      ? lastFail?.message || 'Launch hit a snag — I can retry'
      : live
        ? `Your ${noun} is live`
        : `Building your ${noun}`,
    stages,
    next_action: blocked
      ? {
          label: 'Retry launch',
          message: 'Retry launching my store now.',
        }
      : live
        ? { label: 'Open store', message: live }
        : null,
    flags: {
      is_guest: false,
      is_backend_ready: true,
      is_live: Boolean(live),
      is_payments_ready: false,
      is_production_ready: Boolean(live),
    },
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
  const job = readProductionJobFromWindow()
  const journey = job ? jobToJourney(job) : readLaunchJourneyFromWindow()
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
          <div className={styles.kicker}>{live_url ? 'Your store' : 'Building'}</div>
          <div className={styles.headline}>{headline}</div>
        </div>
        {live_url ? (
          <a className={styles.liveLink} href={live_url} target="_blank" rel="noreferrer">
            Visit store
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
