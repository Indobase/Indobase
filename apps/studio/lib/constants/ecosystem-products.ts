/**
 * Customer-facing Indobase OS product names — single source for chooser, launchers, and docs.
 *
 * Internal code may keep upstream ids (`suite`, `discuss`, `indobase-suite` JWT aud, etc.).
 * Never show Mattermost, Gameplan, Frappe, Suite, Drive, Writer, Notifuse, or other fork names in UI.
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
    tagline: 'Files, docs, sheets, presentations',
    description:
      'Files, docs, sheets, and presentations for this project — one connected workspace.',
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
  meet: {
    id: 'meet',
    name: 'Meet',
    tagline: 'Video meetings for your org and project',
    host: 'meet.indobase.in',
    openLabel: 'Open Meet',
  },
  calendar: {
    id: 'calendar',
    name: 'Calendar',
    tagline: 'Events, availability, and scheduling',
    host: 'calendar.indobase.in',
    openLabel: 'Open Calendar',
  },
  crm: {
    id: 'crm',
    name: 'CRM',
    descriptor: 'Sales',
    tagline: 'Leads, deals, and Kanban for your pipeline',
    host: 'crm.indobase.in',
    openLabel: 'Open CRM',
  },
  helpdesk: {
    id: 'helpdesk',
    name: 'Helpdesk',
    descriptor: 'Support',
    tagline: 'Tickets, SLAs, and knowledge base for customers',
    host: 'helpdesk.indobase.in',
    openLabel: 'Open Helpdesk',
  },
  domains: {
    id: 'domains',
    name: 'Domains',
    tagline: 'Search, register, and manage domains',
    host: 'domains.indobase.in',
    openLabel: 'Open Domains',
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
  {
    id: 'meetings',
    label: 'Meetings',
    description: 'Opens Meet — video meetings for your team',
    externalProduct: 'meet' as const,
  },
  {
    id: 'mail',
    label: 'Mail',
    description: 'Opens Email — campaigns and transactional mail',
    externalProduct: 'email' as const,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    description: 'Opens Calendar — events and scheduling',
    externalProduct: 'calendar' as const,
  },
] as const

export type WorkspaceModuleId = (typeof WORKSPACE_MODULES)[number]['id']
