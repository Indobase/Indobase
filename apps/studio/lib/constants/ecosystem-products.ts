/**
 * Customer-facing Indobase OS product names — single source for chooser, launchers, and docs.
 *
 * Internal code may keep upstream ids (`suite`, `discuss`, `indobase-suite` JWT aud, etc.).
 * Never show Mattermost, Gameplan, Frappe, Suite, Drive, Writer, Notifuse, or other fork names in UI.
 */

import { SUITE_MODULES as STUDIO_SUITE_MODULES } from 'lib/api/saas/suite-launch-shared'

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
    tagline: 'Files, docs, sheets, presentations, meetings, and calendar',
    description:
      'Files, docs, sheets, presentations, meetings, and calendar for this project — one connected workspace.',
    host: 'workspace.indobase.in',
    openLabel: 'Open Workspace',
    openHomeLabel: 'Open Files in Workspace',
    /** Hide launch until Workspace is ready for customers again. */
    comingSoon: true,
  },
  discuss: {
    id: 'discuss',
    name: 'Discuss',
    /** Secondary descriptor — use in subtitles, not as the product tile title */
    descriptor: 'Team chat',
    tagline: 'Team chat for your org and project',
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
    tagline: 'Leads, accounts, deals, and activities in Studio',
    openLabel: 'Open CRM',
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

/**
 * Workspace modules — derived from suite-launch-shared so labels/descriptions cannot drift.
 * externalProduct marks Studio handoffs (Meet / Email / Calendar).
 */
const WORKSPACE_EXTERNAL = {
  meetings: 'meet',
  mail: 'email',
  calendar: 'calendar',
} as const

export const WORKSPACE_MODULES = STUDIO_SUITE_MODULES.map((m) => {
  const external = WORKSPACE_EXTERNAL[m.id as keyof typeof WORKSPACE_EXTERNAL]
  return external ? { ...m, externalProduct: external } : { ...m }
})

export type WorkspaceModuleId = (typeof WORKSPACE_MODULES)[number]['id']
