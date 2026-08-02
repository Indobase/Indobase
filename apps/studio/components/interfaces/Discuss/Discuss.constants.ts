import {
  AlertTriangle,
  CreditCard,
  Hammer,
  Rocket,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

/**
 * Colour in Discuss.
 *
 * Everything structural uses Studio's semantic tokens (`text-foreground`, `bg-surface-100`,
 * `border`, …) so Discuss does not become a parallel visual language. The literals below are the
 * only raw colours introduced, and every one was measured rather than eyeballed.
 *
 * Contrast is computed against the actual theme surfaces:
 *   light: #FFFFFF (background-default), #FCFCFC (surface-100), #F5F5F5 (surface-200)
 *   dark:  #121212 (background-default), #1F1F1F (surface-100)
 *
 * TEXT (WCAG 2.2 AA needs >= 4.5:1 for body text)
 *   light #2B6CA3 → 5.56 / 5.42 / 5.10      dark #8FC4EE → 10.08 / 8.87   (Indobase blue)
 *   light #166534 → 7.13 / 6.95 / 6.54      dark #6EE7B7 → 12.29 / 10.81  (deploy)
 *   light #4338CA → 7.90 / 7.70 / 7.25      dark #A5B4FC →  9.40 /  8.27  (payment)
 *   light #92400E → 7.09 / 6.91 / 6.50      dark #FCD34D → 12.99 / 11.43  (build)
 *   light #B3261E → 6.54 / 6.37 / 6.00      dark #FCA5A5 →  9.87 /  8.68  (failure)
 *
 * NON-TEXT (AA needs >= 3:1 for UI components and graphical objects)
 *   #3B8FD6 → 3.45 on white, 4.78 on #1F1F1F. Passes as a graphic, FAILS as text at 3.45:1 —
 *   so it is used only for focus rings and icon washes and never for a glyph that must be read.
 *
 * Unread badge: #FFFFFF on #2B6CA3 = 5.56:1; #121212 on #8FC4EE = 10.08:1.
 */
export const DISCUSS_BLUE_TEXT = 'text-[#2B6CA3] dark:text-[#8FC4EE]'
export const DISCUSS_UNREAD_BADGE = 'bg-[#2B6CA3] text-white dark:bg-[#8FC4EE] dark:text-[#121212]'
/** Non-text only. 3.45:1 on white is below the text threshold and above the graphics threshold. */
export const DISCUSS_FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B8FD6] focus-visible:ring-offset-1 focus-visible:ring-offset-background'

export type ActivityAccent = 'deploy' | 'payment' | 'build' | 'failure' | 'neutral'

interface AccentStyle {
  /** Colour of the event title and the icon glyph. Measured for AA as body text. */
  text: string
  /** Icon wash + card edge. Non-text, so the lighter values are legitimate here. */
  wash: string
  edge: string
}

export const ACTIVITY_ACCENTS: Record<ActivityAccent, AccentStyle> = {
  deploy: {
    text: 'text-[#166534] dark:text-[#6EE7B7]',
    wash: 'bg-[#166534]/10 dark:bg-[#6EE7B7]/10',
    edge: 'border-l-[#166534] dark:border-l-[#6EE7B7]',
  },
  payment: {
    text: 'text-[#4338CA] dark:text-[#A5B4FC]',
    wash: 'bg-[#4338CA]/10 dark:bg-[#A5B4FC]/10',
    edge: 'border-l-[#4338CA] dark:border-l-[#A5B4FC]',
  },
  build: {
    text: 'text-[#92400E] dark:text-[#FCD34D]',
    wash: 'bg-[#92400E]/10 dark:bg-[#FCD34D]/10',
    edge: 'border-l-[#92400E] dark:border-l-[#FCD34D]',
  },
  failure: {
    text: 'text-[#B3261E] dark:text-[#FCA5A5]',
    wash: 'bg-[#B3261E]/10 dark:bg-[#FCA5A5]/10',
    edge: 'border-l-[#B3261E] dark:border-l-[#FCA5A5]',
  },
  neutral: {
    text: 'text-[#2B6CA3] dark:text-[#8FC4EE]',
    wash: 'bg-[#3B8FD6]/10',
    edge: 'border-l-[#2B6CA3] dark:border-l-[#8FC4EE]',
  },
}

export interface ActivityKind {
  accent: ActivityAccent
  icon: LucideIcon
  /** Human label for the event family, used when the payload gives us nothing better. */
  label: string
}

/**
 * `messages.event_type` is free text — the publisher owns it, and `publish_event` does not validate
 * it. So this is a *hint table*, not an allow-list: an unrecognised type still renders a complete
 * card via ACTIVITY_FALLBACK. Silently dropping an unknown event is precisely the class of failure
 * that made the forks unshippable.
 */
export const ACTIVITY_KINDS: Record<string, ActivityKind> = {
  deploy: { accent: 'deploy', icon: Rocket, label: 'Deploy' },
  deployment: { accent: 'deploy', icon: Rocket, label: 'Deploy' },
  payment: { accent: 'payment', icon: CreditCard, label: 'Payment' },
  invoice: { accent: 'payment', icon: CreditCard, label: 'Invoice' },
  payout: { accent: 'payment', icon: CreditCard, label: 'Payout' },
  build: { accent: 'build', icon: Hammer, label: 'Build' },
  builder: { accent: 'build', icon: Hammer, label: 'Builder' },
}

export const ACTIVITY_FALLBACK: ActivityKind = {
  accent: 'neutral',
  icon: Sparkles,
  label: 'Activity',
}

export const ACTIVITY_FAILURE_ICON = AlertTriangle

/** Outcome suffixes that flip any event family to the failure accent. */
export const ACTIVITY_FAILURE_OUTCOMES = new Set([
  'failed',
  'failure',
  'error',
  'errored',
  'declined',
  'rejected',
  'cancelled',
  'canceled',
  'refunded',
  'crashed',
  'timeout',
  'timedout',
])
