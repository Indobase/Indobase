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
  const [teamKey, projectKey, ...segments] = rest.split('/').map(decodeURIComponent)

  if (!teamKey || !projectKey) return '/'

  const segment = segments[0] || ''
  const upstreamSegment: Record<string, string> = {
    '': '',
    files: 'drive',
    docs: 'writer',
    sheets: 'sheets',
    presentations: 'slides',
    meetings: 'meet',
    calendar: 'calendar',
  }

  const mapped = upstreamSegment[segment] ?? segment
  if (!mapped) {
    return `/suite/${teamKey}/${projectKey}`
  }
  return `/suite/${teamKey}/${projectKey}/${mapped}`
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
