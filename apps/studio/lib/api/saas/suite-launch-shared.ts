/**
 * Client-safe Workspace SSO helpers (no Node crypto / DB imports).
 */

export const SUITE_ALLOWED_ROLES = ['owner', 'admin', 'developer', 'viewer'] as const
export type SuiteRole = (typeof SUITE_ALLOWED_ROLES)[number]

export const SUITE_ROLE_DENIED_CODE = 'suite_role_denied' as const

export const SUITE_MODULE_IDS = [
  'files',
  'docs',
  'sheets',
  'presentations',
  'meetings',
  'mail',
  'calendar',
] as const

export type SuiteModuleId = (typeof SUITE_MODULE_IDS)[number]

export type SuiteModuleMeta = {
  id: SuiteModuleId
  label: string
  description: string
  externalProduct?: 'email' | 'design'
}

/**
 * Tiles shown in Studio's "Open a module" grid.
 *
 * `files` and `mail` are deliberately absent: Files is already the primary action above the grid
 * ("Open Files in Workspace") and is Workspace's landing surface, so a tile duplicated it; Mail
 * opens Email, a separate product, so it did not belong in a Workspace module grid.
 *
 * They remain in SUITE_MODULE_IDS on purpose — that array validates the launch API's `?module=`
 * param, and dropping them there would break existing deep links and the Files primary action.
 * Not shown in the grid is not the same as not routable.
 */
export const SUITE_MODULES: SuiteModuleMeta[] = [
  { id: 'docs', label: 'Docs', description: 'Write and collaborate on documents' },
  { id: 'sheets', label: 'Sheets', description: 'Spreadsheets with realtime collaboration' },
  { id: 'presentations', label: 'Presentations', description: 'Slide decks for your project' },
  {
    id: 'meetings',
    label: 'Meetings',
    description: 'Opens Meet — video meetings for your team',
  },
  { id: 'calendar', label: 'Calendar', description: 'Opens Calendar — events and scheduling' },
]

const ALLOWED_ROLE_SET = new Set<string>(SUITE_ALLOWED_ROLES)
const MODULE_SET = new Set<string>(SUITE_MODULE_IDS)

export function isSuiteRole(role: string | null | undefined): role is SuiteRole {
  return !!role && ALLOWED_ROLE_SET.has(role)
}

export function isSuiteModuleId(value: string | null | undefined): value is SuiteModuleId {
  return !!value && MODULE_SET.has(value)
}

/** Deterministic workspace team key from org slug — mirrors bridge workspace-map. */
export function suiteTeamKeyForOrgSlug(orgSlug: string): string {
  const cleaned = orgSlug
    .toLowerCase()
    .split('')
    .filter((c) => /[a-z0-9-]/.test(c))
    .join('')
    .slice(0, 64)
  if (!cleaned) return 'ib-ws-org-default'
  return `ib-ws-org-${cleaned}`.slice(0, 64)
}

/** Deterministic workspace project key from project ref. */
export function suiteProjectKeyForProjectRef(projectRef: string): string {
  const cleaned = projectRef
    .toLowerCase()
    .split('')
    .filter((c) => /[a-z0-9]/.test(c))
    .join('')
    .slice(0, 40)
  if (!cleaned) return 'ib-ws-proj-default'
  return `ib-ws-proj-${cleaned}`.slice(0, 64)
}

export function isSuiteRoleDeniedMessage(message: string | null | undefined): boolean {
  if (!message) return false
  const lower = message.toLowerCase()
  return (
    lower.includes(SUITE_ROLE_DENIED_CODE) ||
    lower.includes('organization owner or admin') ||
    (lower.includes('workspace') && lower.includes('ask an organization'))
  )
}
