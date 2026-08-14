import { memo } from 'react'

import type { PresentationSurface } from './presentation'

import styles from './ExecutionCard.module.css'

export const ExecutionCard = memo(function ExecutionCard({
  card,
  stream,
}: {
  card: PresentationSurface['executionCard']
  stream?: PresentationSurface['stream'] | null
}) {
  if (!card) return null
  return (
    <section className={styles.root} data-kind={card.kind} aria-label={card.title}>
      {stream && stream.phase !== 'IDLE' ? <div className={styles.phase}>{stream.label}</div> : null}
      <div className={styles.title}>{card.title}</div>
      <p className={styles.body}>{card.body}</p>
    </section>
  )
})
