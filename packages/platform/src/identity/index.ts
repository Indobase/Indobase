import type { AgentId, OrganizationId, ProjectRef, UserId } from '../ids'

/**
 * Identity — Organization, Project, User, Agent, Role, Permission.
 * OS identity is IdentityAdapter (OTP → session). Studio-era claims remain a
 * hidden adapter until migrated — not a customer product.
 */

export * from './adapter'

export type Role = 'owner' | 'admin' | 'developer' | 'viewer' | (string & {})

/** Fine-grained permission string, e.g. auth:signIn, checkout:create */
export type Permission = string

export type PlatformActor =
  | {
      kind: 'user'
      userId: UserId | string
      organizationId?: OrganizationId | string
      role?: Role
    }
  | {
      kind: 'agent'
      agentId: AgentId | string
      onBehalfOf?: UserId | string
      organizationId?: OrganizationId | string
      role?: Role
    }
  | {
      kind: 'system'
      reason: string
    }

export type IdentityContext = {
  actor: PlatformActor
  organizationId?: OrganizationId | string
  projectRef?: ProjectRef | string
  permissions?: readonly Permission[]
}

/** Wrap Studio / handoff-style claims into IdentityContext (no network). */
export function identityFromClaims(claims: {
  sub?: string
  project_ref?: string
  organization_id?: string
  role?: string
  agent_id?: string
}): IdentityContext {
  if (claims.agent_id) {
    return {
      actor: {
        kind: 'agent',
        agentId: claims.agent_id,
        onBehalfOf: claims.sub,
        organizationId: claims.organization_id,
        role: claims.role as Role | undefined,
      },
      organizationId: claims.organization_id,
      projectRef: claims.project_ref,
    }
  }

  return {
    actor: {
      kind: 'user',
      userId: claims.sub || 'anonymous',
      organizationId: claims.organization_id,
      role: claims.role as Role | undefined,
    },
    organizationId: claims.organization_id,
    projectRef: claims.project_ref,
  }
}
