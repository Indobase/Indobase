/**
 * Outcome-centric home — launch a production application.
 */

export type OsAchievement = {
  id: string
  label: string
  prompt: string
  navId?: string
  formatHint?: 'design' | 'website' | 'commerce' | 'auth' | 'database'
}

const LAUNCH_JOB_PROMPT = (appType: 'saas' | 'ecommerce' | 'landing', label: string) =>
  `Launch a production-ready ${label}. After account verify if needed, POST /api/os/apps/launch { appType: "${appType}", production: true, intent: their ask }. Do NOT call ensureLogin, guidedBackend, or launchBusiness yourself — the job owns those stages. Quote job status and ONLY the live URL when status=live.`

export const OS_ACHIEVEMENTS: readonly OsAchievement[] = [
  {
    id: 'launch-saas',
    label: 'Launch a SaaS',
    prompt: LAUNCH_JOB_PROMPT('saas', 'SaaS with customer accounts and saved data'),
    navId: 'launch',
  },
  {
    id: 'launch-store',
    label: 'Launch a store',
    prompt: LAUNCH_JOB_PROMPT('ecommerce', 'online store'),
    navId: 'commerce',
    formatHint: 'commerce',
  },
  {
    id: 'launch-landing',
    label: 'Launch a landing page',
    prompt: LAUNCH_JOB_PROMPT('landing', 'landing page'),
    navId: 'website',
    formatHint: 'website',
  },
  {
    id: 'logo',
    label: 'Create a logo',
    prompt:
      'ALWAYS use Design format (format.design). Create a professional logo for my business.',
    navId: 'brand',
    formatHint: 'design',
  },
  {
    id: 'go-live',
    label: 'Go Live',
    prompt:
      'Make this production — POST /api/os/apps/launch { production: true } with current html/files if any. Quote job stages. ONLY claim a URL when status=live.',
    navId: 'launch',
  },
  {
    id: 'create-account',
    label: 'Create account',
    prompt:
      'Create Indobase account in chat (name + email + DPDP → POST /auth/start → OTP → POST /auth/verify) or via Create account.',
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

export const OS_HOME_HEADLINE = 'What do you want to launch?'
export const OS_HOME_SUBHEAD =
  'Launch a production-ready application from one prompt — accounts, data, and hosting included when the app needs them.'
