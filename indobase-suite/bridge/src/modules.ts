/**
 * Indobase Workspace modules — customer-facing names and deep-link segments.
 *
 * Mail routes to Email, not upstream Suite Mail.
 * Presentations can optionally open Design for canvas work.
 */

import type { WorkspaceMap } from './workspace-map.js'
import { workspaceHomePath } from './workspace-map.js'

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

export type SuiteModule = {
  id: SuiteModuleId
  /** Customer-facing label */
  label: string
  description: string
  /** Route segment under workspace home (Indobase-branded paths) */
  segment: string
  /** When set, Studio should SSO to this product instead of Workspace */
  externalProduct?: 'email' | 'design'
}

export const SUITE_MODULES: Record<SuiteModuleId, SuiteModule> = {
  files: {
    id: 'files',
    label: 'Files',
    description: 'Store, organize, and share project files',
    segment: 'files',
  },
  docs: {
    id: 'docs',
    label: 'Docs',
    description: 'Write and collaborate on documents',
    segment: 'docs',
  },
  sheets: {
    id: 'sheets',
    label: 'Sheets',
    description: 'Spreadsheets with realtime collaboration',
    segment: 'sheets',
  },
  presentations: {
    id: 'presentations',
    label: 'Presentations',
    description: 'Slide decks for your project',
    segment: 'presentations',
  },
  meetings: {
    id: 'meetings',
    label: 'Meetings',
    description: 'Video meetings for your team',
    segment: 'meetings',
  },
  mail: {
    id: 'mail',
    label: 'Mail',
    description: 'Opens Email — campaigns and transactional mail',
    segment: 'mail',
    externalProduct: 'email',
  },
  calendar: {
    id: 'calendar',
    label: 'Calendar',
    description: 'Events and schedules',
    segment: 'calendar',
  },
}

export function isSuiteModuleId(value: string | null | undefined): value is SuiteModuleId {
  return !!value && (SUITE_MODULE_IDS as readonly string[]).includes(value)
}

export function modulePath(map: WorkspaceMap, moduleId: SuiteModuleId): string {
  const mod = SUITE_MODULES[moduleId]
  if (mod.externalProduct === 'email') {
    return '/external/email'
  }
  const home = workspaceHomePath(map)
  return `${home}/${mod.segment}`
}

/** Map bridge paths to upstream Frappe Suite SPA routes when proxying. */
export function upstreamSuitePath(bridgePath: string): string {
  const prefix = '/s/'
  if (!bridgePath.startsWith(prefix)) return bridgePath

  const rest = bridgePath.slice(prefix.length)
  const segments = rest.split('/').map(decodeURIComponent)
  const moduleSegment = segments[2] || ''

  const upstreamByModule: Record<string, string> = {
    files: '/drive',
    docs: '/writer',
    sheets: '/sheets',
    presentations: '/slides',
    meetings: '/meet',
    calendar: '/calendar',
  }

  if (moduleSegment && upstreamByModule[moduleSegment]) {
    return upstreamByModule[moduleSegment]
  }

  // Suite SPA launcher — `/suite/{team}/{project}` is not a valid client route.
  return '/suite'
}

export function listModulesForApi(): Array<{
  id: SuiteModuleId
  label: string
  description: string
  externalProduct?: string
}> {
  return SUITE_MODULE_IDS.map((id) => {
    const m = SUITE_MODULES[id]
    return {
      id: m.id,
      label: m.label,
      description: m.description,
      externalProduct: m.externalProduct,
    }
  })
}
