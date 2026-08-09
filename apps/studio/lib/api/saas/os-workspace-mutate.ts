/**
 * OS agent: rename org / workspace without Studio wizards.
 */
import { executeQuery } from './query'
import { getOsWorkspace } from './os-workspace'
import { getGotrueUserId, updateOrganization, updateProject, type Claims } from './platform'

export type UpdateOsWorkspaceInput = {
  claims: Claims
  workspaceRef: string
  /** Project / workspace display name */
  name?: string | null
  /** Business / org display name */
  brand?: string | null
  organizationName?: string | null
  projectName?: string | null
}

export type UpdateOsWorkspaceResult = {
  ok: true
  organization_slug: string
  organization_name: string
  workspace_ref: string
  workspace_name: string
  message: string
}

function trimName(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  return t.length > 0 ? t.slice(0, 64) : null
}

/**
 * Update org display name and/or project workspace name for the signed-in operator.
 * - brand / organizationName → saas.organizations.name
 * - name / projectName → saas.projects.name
 * - If only one side is provided, apply it to both (common “rename business” ask).
 */
export async function updateOsWorkspaceNames(
  input: UpdateOsWorkspaceInput,
): Promise<UpdateOsWorkspaceResult | { ok: false; status: number; message: string; code?: string }> {
  const workspaceRef = input.workspaceRef.trim()
  if (!workspaceRef) {
    return { ok: false, status: 400, message: 'workspace_ref required', code: 'workspace_ref_required' }
  }

  const workspace = await getOsWorkspace({ claims: input.claims, ref: workspaceRef })
  if (!workspace) {
    return { ok: false, status: 404, message: 'Workspace not found', code: 'workspace_not_found' }
  }

  const brand = trimName(input.brand ?? input.organizationName)
  const projectName = trimName(input.projectName ?? input.name)

  let orgNameTarget: string | null = brand
  let projectNameTarget: string | null = projectName

  if (brand && !projectName) {
    projectNameTarget = brand
  } else if (projectName && !brand) {
    orgNameTarget = projectName
  }

  if (!orgNameTarget && !projectNameTarget) {
    return {
      ok: false,
      status: 400,
      message: 'Provide name and/or brand (organization or workspace display name)',
      code: 'name_required',
    }
  }

  let resolvedOrgName = ''
  let resolvedProjectName = workspace.name

  if (orgNameTarget) {
    const org = await updateOrganization({
      claims: input.claims,
      slug: workspace.organization_slug,
      updates: { name: orgNameTarget },
    })
    if (!org) {
      return {
        ok: false,
        status: 403,
        message: 'Not allowed to update this organization',
        code: 'org_update_forbidden',
      }
    }
    resolvedOrgName = org.name
  }

  if (projectNameTarget) {
    const project = await updateProject({
      claims: input.claims,
      ref: workspaceRef,
      updates: { name: projectNameTarget },
    })
    if (!project) {
      return {
        ok: false,
        status: 403,
        message: 'Not allowed to update this workspace',
        code: 'project_update_forbidden',
      }
    }
    resolvedProjectName = project.name
  }

  if (!resolvedOrgName) {
    const gotrueId = getGotrueUserId(input.claims)
    const orgRows = await executeQuery<{ name: string }>({
      query: `select name from saas.organizations where slug = $1 limit 1`,
      parameters: [workspace.organization_slug],
      actorId: gotrueId,
    })
    if (orgRows.error) throw orgRows.error
    resolvedOrgName = orgRows.data?.[0]?.name || workspace.organization_slug
  }

  return {
    ok: true,
    organization_slug: workspace.organization_slug,
    organization_name: resolvedOrgName,
    workspace_ref: workspace.ref,
    workspace_name: resolvedProjectName,
    message: 'Workspace updated',
  }
}
