/**
 * Agentic Business OS — task navigation (not product chooser).
 * Customer thinks in business domains; engines stay behind Capabilities.
 */

export type BusinessOsNavId =
  | 'home'
  | 'ai'
  | 'website'
  | 'mobile'
  | 'brand'
  | 'customers'
  | 'commerce'
  | 'analytics'
  | 'marketing'
  | 'automations'
  | 'workers'
  | 'launch'
  | 'settings'

export type BusinessOsNavItem = {
  id: BusinessOsNavId
  label: string
  /** Short glyph (emoji avoided in chrome; use letters / symbols) */
  icon: string
  /** Prompt the OS suggests when this nav item is activated */
  prompt: string
  /** Maps to native format / document kind when applicable */
  documentHint?: 'design' | 'website' | 'app' | 'crm' | 'commerce' | 'analytics' | 'automation'
}

/** Canonical left-rail order for Indobase OS. */
export const BUSINESS_OS_NAV: readonly BusinessOsNavItem[] = [
  {
    id: 'home',
    label: 'Home',
    icon: '⌂',
    prompt: 'Summarize my business and what we should build or improve next.',
  },
  {
    id: 'ai',
    label: 'AI',
    icon: '◇',
    prompt: 'Help me plan and operate my business end to end.',
  },
  {
    id: 'website',
    label: 'Website',
    icon: '◎',
    prompt: 'Build or improve my website and landing pages.',
    documentHint: 'website',
  },
  {
    id: 'mobile',
    label: 'Mobile App',
    icon: '▣',
    prompt: 'Build or improve my mobile app.',
    documentHint: 'app',
  },
  {
    id: 'brand',
    label: 'Brand',
    icon: '◈',
    prompt:
      'ALWAYS use Design format (format.design). Create or refine my brand: logo, colors, and social creatives.',
    documentHint: 'design',
  },
  {
    id: 'customers',
    label: 'Customers',
    icon: '◉',
    prompt: 'Set up customers — Enable Business Data / CRM skills inside Indobase. Do not send me to another product.',
    documentHint: 'crm',
  },
  {
    id: 'commerce',
    label: 'Commerce',
    icon: '₹',
    prompt: 'Start accepting payments — Enable Payments for my business. Do not send me to another product or ask which payment vendor.',
    documentHint: 'commerce',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: '▤',
    prompt: 'Enable Analytics for my business — a simple dashboard. Do not connect an external analytics product.',
    documentHint: 'analytics',
  },
  {
    id: 'marketing',
    label: 'Marketing',
    icon: '✦',
    prompt:
      'ALWAYS use Design format (format.design) for creatives. Plan a marketing campaign and assets.',
    documentHint: 'design',
  },
  {
    id: 'automations',
    label: 'Automations',
    icon: '⟳',
    prompt: 'Create automations and workflows for my business operations.',
    documentHint: 'automation',
  },
  {
    id: 'workers',
    label: 'AI Workers',
    icon: '⬡',
    prompt: 'Propose AI workers (sales, support, marketing, ops) with goals and permissions for my business.',
  },
  {
    id: 'launch',
    label: 'Launch Business',
    icon: '▶',
    prompt:
      'Launch my business — call launchBusiness (POST /api/os/tools/launchBusiness) with real html/files, then return ONLY the live URL from the API response. Never invent a URL or use a third-party host.',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: '⚙',
    prompt: 'Review project settings, identity, and linked capabilities.',
  },
] as const

export function businessOsNavById(id: string): BusinessOsNavItem | undefined {
  return BUSINESS_OS_NAV.find((item) => item.id === id)
}

/** Gate for every feature: finish inside Indobase OS without leaving. */
export const BUSINESS_OS_FINISH_IN_OS_PRINCIPLE =
  'Can a business owner complete this entire task without leaving Indobase OS?'

/**
 * Command-palette / agent-discoverable SaaS actions (half-wired chrome).
 * Surfaced on /api/session + AGENT_HINT — not a full CFOS UI rebuild.
 */
export type BusinessOsDiscoverableAction = {
  id: string
  label: string
  /** Prompt / instruction the agent should follow when this action is chosen */
  prompt: string
  /** Guests-only vs signed-in */
  audience: 'guest' | 'signed_in' | 'any'
}

export const BUSINESS_OS_DISCOVERABLE_ACTIONS: readonly BusinessOsDiscoverableAction[] = [
  {
    id: 'create-account',
    label: 'Create account',
    audience: 'guest',
    prompt:
      'Create Indobase account in chat: name + email + DPDP consent → POST /auth/start → OTP → POST /auth/verify. Then continue their original request.',
  },
  {
    id: 'go-live',
    label: 'Go Live',
    audience: 'signed_in',
    prompt:
      'Launch my business — call launchBusiness (POST /api/os/tools/launchBusiness) with real html/files, then return ONLY the live URL from the API. Never invent a URL.',
  },
  {
    id: 'launch-business',
    label: 'Launch Business',
    audience: 'signed_in',
    prompt:
      'Launch my business — call launchBusiness with real html/files and quote the API url only.',
  },
  {
    id: 'add-login',
    label: 'Add login',
    audience: 'signed_in',
    prompt:
      'Add user login — Enable Customer Login via POST /api/os/runtime/ensure { capability: "login" }. Quote Login enabled + next_steps. Optionally brand OTP From with POST /api/os/auth/mail { from_email, from_name }. Never connect an external auth product.',
  },
  {
    id: 'login-mail',
    label: 'Set login email From',
    audience: 'signed_in',
    prompt:
      'Brand product login OTP From — POST /api/os/auth/mail with from_email + from_name (or mode indobase to use Indobase mail). Quote the API message. Never ask which mail vendor.',
  },
  {
    id: 'enable-payments',
    label: 'Enable payments',
    audience: 'signed_in',
    prompt:
      'Start accepting payments — Enable Payments via runtime/ensure. Quote the API message (finish checkout setup / pending); do not claim Payments are live from ensure alone. Use launch_url when present. Do not ask which payment vendor.',
  },
] as const

export function discoverableActionsForSession(options: {
  guest: boolean
}): BusinessOsDiscoverableAction[] {
  return BUSINESS_OS_DISCOVERABLE_ACTIONS.filter((a) => {
    if (a.audience === 'any') return true
    if (options.guest) return a.audience === 'guest'
    return a.audience === 'signed_in'
  })
}
