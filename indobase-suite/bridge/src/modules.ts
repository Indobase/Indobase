/**
 * Indobase Workspace modules — customer-facing names and deep-link segments.
 *
 * Mail routes to Email. Docs/Sheets/Presentations open the document editor.
 * Meetings launches Indobase Meet (SSO) — never embeds a raw engine iframe.
 * Calendar launches Indobase Calendar (SSO) — never embeds a raw engine iframe.
 */

import type { WorkspaceMap } from './workspace-map.js'
import { workspaceHomePath } from './workspace-map.js'
import type { WorkspaceFileKind } from './files.js'

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
  label: string
  description: string
  segment: string
  externalProduct?: 'email' | 'design'
  /** File kinds shown / created in this module */
  fileKind?: WorkspaceFileKind
  /** Soft placeholder — no editor yet */
  placeholder?: boolean
}

export const SUITE_MODULES: Record<SuiteModuleId, SuiteModule> = {
  // Customer-facing copy — keep in sync with apps/studio suite-launch-shared SUITE_MODULES
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
    fileKind: 'doc',
  },
  sheets: {
    id: 'sheets',
    label: 'Sheets',
    description: 'Spreadsheets with realtime collaboration',
    segment: 'sheets',
    fileKind: 'sheet',
  },
  presentations: {
    id: 'presentations',
    label: 'Presentations',
    description: 'Slide decks for your project',
    segment: 'presentations',
    fileKind: 'slide',
  },
  meetings: {
    id: 'meetings',
    label: 'Meetings',
    description: 'Opens Meet — video meetings for your team',
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
    description: 'Opens Calendar — events and scheduling',
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

export function listModulesForApi(): Array<{
  id: SuiteModuleId
  label: string
  description: string
  externalProduct?: string
  placeholder?: boolean
}> {
  return SUITE_MODULE_IDS.map((id) => {
    const m = SUITE_MODULES[id]
    return {
      id: m.id,
      label: m.label,
      description: m.description,
      externalProduct: m.externalProduct,
      placeholder: m.placeholder,
    }
  })
}
