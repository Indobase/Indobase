/**
 * Outcome-centric home — tell us what business you want to launch.
 */
import { HOME_INTENTS, UX_HOME_HEADLINE, UX_HOME_SUBHEAD } from './ux-conductor.js'

export type OsAchievement = {
  id: string
  label: string
  prompt: string
  navId?: string
  formatHint?: 'design' | 'website' | 'commerce' | 'auth' | 'database'
}

export const OS_ACHIEVEMENTS: readonly OsAchievement[] = [
  ...HOME_INTENTS.map((tile) => ({
    id: tile.id,
    label: tile.label,
    prompt: tile.prompt,
    navId: tile.appType === 'ecommerce' ? 'commerce' : tile.appType === 'landing' ? 'website' : 'launch',
    formatHint:
      tile.appType === 'ecommerce' ? ('commerce' as const) : tile.appType === 'landing' ? ('website' as const) : undefined,
  })),
  {
    id: 'logo',
    label: 'Create a logo',
    prompt: 'Create a professional logo for my business.',
    navId: 'brand',
    formatHint: 'design',
  },
  {
    id: 'go-live',
    label: 'Launch store',
    prompt: 'Launch my store on Indobase now.',
    navId: 'launch',
  },
  {
    id: 'create-account',
    label: 'Create account',
    prompt: 'Create my Indobase account so I can launch (name, email, and privacy consent).',
  },
] as const

export function renderAchievementGrid(): string {
  return OS_ACHIEVEMENTS.map(
    (a) =>
      `<button type="button" class="achievement" data-achievement="${a.id}" data-prompt="${escapeAttr(a.prompt)}" data-nav="${a.navId || ''}" data-format="${a.formatHint || ''}">${a.label}</button>`,
  ).join('\n')
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
}

export const OS_HOME_HEADLINE = UX_HOME_HEADLINE
export const OS_HOME_SUBHEAD = UX_HOME_SUBHEAD
