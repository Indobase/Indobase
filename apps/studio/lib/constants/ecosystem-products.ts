/**
 * Customer-facing Indobase OS product names — single source for chooser, launchers, and docs.
 *
 * Internal code may keep upstream ids (`suite`, `discuss`, `indobase-suite` JWT aud, etc.).
 * Never show Gameplan, Frappe, Suite, Drive, Writer, Notifuse, or other fork names in UI.
 */

export const ECOSYSTEM_PRODUCTS = {
  builder: {
    id: 'builder',
    name: 'Builder',
    tagline: 'Build your app with AI',
    openLabel: 'Open Builder',
  },
  backend: {
    id: 'backend',
    name: 'Backend Studio',
    tagline: 'Database, auth, storage, functions',
  },
  workspace: {
    id: 'workspace',
    name: 'Workspace',
    tagline: 'Files, docs, sheets, meetings, calendar',
    description:
      'Files, docs, sheets, presentations, meetings, and calendar for this project — one connected workspace.',
    host: 'workspace.indobase.in',
    openLabel: 'Open Workspace',
    openHomeLabel: 'Open Workspace home',
  },
  discuss: {
    id: 'discuss',
    name: 'Discuss',
    /** Secondary descriptor — use in subtitles, not as the product tile title */
    descriptor: 'Team chat',
    tagline: 'Team chat for your org and project',
    host: 'discuss.indobase.in',
    openLabel: 'Open Discuss',
  },
  payments: {
    id: 'payments',
    name: 'Payments',
    tagline: 'Collect INR, invoices, payouts',
  },
  analytics: {
    id: 'analytics',
    name: 'Analytics',
    tagline: 'Traffic, signups, product events',
  },
  design: {
    id: 'design',
    name: 'Design',
    tagline: 'Posts, flyers, brand kit',
    openLabel: 'Open Design',
  },
  email: {
    id: 'email',
    name: 'Email',
    tagline: 'Campaigns and transactional mail',
    openLabel: 'Open Email',
  },
  social: {
    id: 'social',
    name: 'Social',
    tagline: 'Schedule posts across channels',
  },
  video: {
    id: 'video',
    name: 'Video',
    tagline: 'Edit and export video',
  },
} as const

/** Workspace modules — customer-facing labels only */
export const WORKSPACE_MODULES = [
  { id: 'files', label: 'Files', description: 'Store, organize, and share project files' },
  { id: 'docs', label: 'Docs', description: 'Write and collaborate on documents' },
  { id: 'sheets', label: 'Sheets', description: 'Spreadsheets with realtime collaboration' },
  { id: 'presentations', label: 'Presentations', description: 'Slide decks for your project' },
  { id: 'meetings', label: 'Meetings', description: 'Video meetings for your team' },
  {
    id: 'mail',
    label: 'Mail',
    description: 'Opens Email — campaigns and transactional mail',
    externalProduct: 'email' as const,
  },
  { id: 'calendar', label: 'Calendar', description: 'Events and schedules' },
] as const

export type WorkspaceModuleId = (typeof WORKSPACE_MODULES)[number]['id']
