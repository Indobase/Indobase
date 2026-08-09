/**
 * Agent-facing updateWorkspace — rename org / business / project via Platform API.
 */

import type { WorkspaceUpdateResponse } from '@indobase/platform-api'

import { platformWorkspaceUpdate } from './platform-api-client.js'

export const UPDATE_WORKSPACE_TOOL = {
  name: 'updateWorkspace',
  aliases: ['renameBusiness', 'setBusinessName', 'rename_workspace'] as const,
  description:
    'Set organization (brand) and/or project workspace display names after verify or when the brand is known. ' +
    'Silent Free workspace from OTP is fine — call this only when a name is known. ' +
    'Aliases: renameBusiness, setBusinessName.',
  method: 'POST' as const,
  path: '/api/os/tools/updateWorkspace',
  aliasPath: '/api/os/tools/renameBusiness',
  wraps: '/api/os/v1/workspace/update',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Project / workspace display name (also used for org if brand omitted)',
      },
      brand: {
        type: 'string',
        description: 'Organization / business brand name (also used for project if name omitted)',
      },
      organization_name: { type: 'string', description: 'Optional explicit org name' },
      project_name: { type: 'string', description: 'Optional explicit project name' },
    },
  },
} as const

export const UPDATE_WORKSPACE_AGENT_HARD_RULES = `
## updateWorkspace (HARD PATH — rename brand / workspace)

When the operator names their business or you know the brand after verify:

1. Optionally call **updateWorkspace** (aliases **renameBusiness**, **setBusinessName**) —
   POST /api/os/tools/updateWorkspace with { "brand": "…", "name": "…" } (either field is enough).
2. Do NOT run Studio org/project wizards. Silent Free org + OS workspace from OTP is fine.
3. Do NOT invent names. Quote tool JSON: ok, organization_name, workspace_name.
4. Prefer this tool over asking them to open Studio settings.
`.trim()

export type UpdateWorkspaceToolInput = {
  name?: string | null
  brand?: string | null
  organization_name?: string | null
  organizationName?: string | null
  project_name?: string | null
  projectName?: string | null
  workspace_name?: string | null
}

export type UpdateWorkspaceToolResult = WorkspaceUpdateResponse & {
  tool: 'updateWorkspace'
  status?: number
}

export function assertUpdateWorkspaceHasName(input: UpdateWorkspaceToolInput): {
  ok: boolean
  message?: string
} {
  const has =
    Boolean(input.name?.trim()) ||
    Boolean(input.brand?.trim()) ||
    Boolean(input.organization_name?.trim()) ||
    Boolean(input.organizationName?.trim()) ||
    Boolean(input.project_name?.trim()) ||
    Boolean(input.projectName?.trim()) ||
    Boolean(input.workspace_name?.trim())
  if (!has) {
    return { ok: false, message: 'Provide name and/or brand' }
  }
  return { ok: true }
}

export async function executeUpdateWorkspaceTool(
  session: { gotrueId: string; email: string; projectRef: string },
  input: UpdateWorkspaceToolInput,
): Promise<UpdateWorkspaceToolResult> {
  const check = assertUpdateWorkspaceHasName(input)
  if (!check.ok) {
    return {
      ok: false,
      message: check.message || 'Invalid updateWorkspace input',
      tool: 'updateWorkspace',
      status: 400,
    }
  }

  const result = await platformWorkspaceUpdate({
    gotrueId: session.gotrueId,
    email: session.email,
    workspaceRef: session.projectRef,
    name: input.name,
    brand: input.brand,
    organizationName: input.organization_name || input.organizationName,
    projectName: input.project_name || input.projectName || input.workspace_name,
  })

  return {
    ...result,
    tool: 'updateWorkspace',
  }
}

export function updateWorkspaceToolCatalog() {
  return {
    name: UPDATE_WORKSPACE_TOOL.name,
    aliases: [...UPDATE_WORKSPACE_TOOL.aliases],
    description: UPDATE_WORKSPACE_TOOL.description,
    method: UPDATE_WORKSPACE_TOOL.method,
    path: UPDATE_WORKSPACE_TOOL.path,
    alias_path: UPDATE_WORKSPACE_TOOL.aliasPath,
    wraps: UPDATE_WORKSPACE_TOOL.wraps,
    parameters: UPDATE_WORKSPACE_TOOL.parameters,
    rules: UPDATE_WORKSPACE_AGENT_HARD_RULES,
  }
}
