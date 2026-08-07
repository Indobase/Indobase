/**
 * Achievement-oriented home — “What do you want to achieve today?”
 */

export type OsAchievement = {
  id: string
  label: string
  prompt: string
  navId?: string
  formatHint?: 'design' | 'website' | 'commerce' | 'auth'
}

export const OS_ACHIEVEMENTS: readonly OsAchievement[] = [
  {
    id: 'launch-saas',
    label: 'Launch my SaaS',
    prompt: 'Help me launch my SaaS business end to end inside Indobase OS.',
    navId: 'launch',
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
    id: 'landing',
    label: 'Design landing page',
    prompt: 'Build a high-converting landing page for my business.',
    navId: 'website',
    formatHint: 'website',
  },
  {
    id: 'login',
    label: 'Add login',
    prompt: 'Add user login to my business — Enable Customer Login (never connect an external auth product).',
    formatHint: 'auth',
  },
  {
    id: 'payments',
    label: 'Enable payments',
    prompt: 'Start charging customers — Enable Payments for my business. Do not ask which payment vendor.',
    navId: 'commerce',
    formatHint: 'commerce',
  },
  {
    id: 'go-live',
    label: 'Go Live',
    prompt:
      'Launch my business — call launchBusiness (POST /api/os/tools/launchBusiness) with real html/files, then return ONLY the live URL from the API.',
    navId: 'launch',
  },
  {
    id: 'create-account',
    label: 'Create account',
    prompt:
      'Create Indobase account in chat: name + email + DPDP consent → POST /auth/start → OTP → POST /auth/verify.',
  },
  {
    id: 'crm',
    label: 'Import customers',
    prompt: 'Set up my customer CRM: contacts, pipeline, and follow-ups.',
    navId: 'customers',
  },
  {
    id: 'invoices',
    label: 'Generate invoices',
    prompt: 'Create professional invoices and billing documents for my business.',
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

export const OS_HOME_HEADLINE = 'What do you want to achieve today?'
