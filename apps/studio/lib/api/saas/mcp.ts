import {
  AccountOperations,
  ApiKey,
  ApiKeyType,
  ApplyMigrationOptions,
  DatabaseOperations,
  DebuggingOperations,
  DevelopmentOperations,
  ExecuteSqlOptions,
  GetLogsOptions,
} from '@supabase/mcp-server-supabase/platform'
import type { JwtPayload } from 'indobase-js'
import { ResponseError } from 'types'
import { generateTypescriptTypes } from './generate-types'
import { getLints } from './lints'
import { getLogQuery, retrieveAnalyticsData } from './logs'
import { applyAndTrackMigrations, listMigrationVersions } from './migrations'
import { getGotrueUserId, getProject, listOrganizations, listProjects } from './platform'
import { executeQuery } from './query'
import { getProjectSettings, getProjectSettingsForRef, type ProjectSettings } from './settings'
import { encryptedConnectionForPgMeta } from './util'

export type GetDatabaseOperationsOptions = {
  headers?: HeadersInit
  claims?: JwtPayload
  projectRef?: string
}

export type GetDevelopmentOperationsOptions = {
  headers?: HeadersInit
  claims?: JwtPayload
  projectRef?: string
}

export type GetDebuggingOperationsOptions = {
  headers?: HeadersInit
  claims?: JwtPayload
  projectRef?: string
}

export type GetAccountOperationsOptions = {
  claims?: JwtPayload
}

type ScopedProjectContext = {
  actorId?: string
  headers?: Headers
  projectRef?: string
  settings?: ProjectSettings | null
}

async function resolveScopedProjectContext({
  claims,
  headers,
  projectRef,
}: {
  claims?: JwtPayload
  headers?: HeadersInit
  projectRef?: string
}): Promise<ScopedProjectContext> {
  if (!claims || !projectRef) {
    return {
      actorId: undefined,
      headers: headers ? new Headers(headers) : undefined,
      projectRef,
      settings: null,
    }
  }

  const actorId = getGotrueUserId(claims as JwtPayload & Record<string, unknown>)
  const settings = await getProjectSettingsForRef({ claims, ref: projectRef })

  if (!settings) {
    throw new Error('Project not found or access denied')
  }

  const row = await executeQuery<{
    connection_string: string | null
    connection_string_enc: string | null
  }>({
    query: `
      select p.connection_string, p.connection_string_enc
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [projectRef, actorId],
    actorId,
  })

  if (row.error) {
    throw row.error
  }

  if (!row.data?.length) {
    throw new Error('Project database URL not found')
  }

  const scopedHeaders = new Headers(headers)
  const connectionEncrypted =
    row.data[0].connection_string_enc?.trim() ||
    encryptedConnectionForPgMeta(row.data[0].connection_string)

  scopedHeaders.set('x-connection-encrypted', connectionEncrypted)

  return {
    actorId,
    headers: scopedHeaders,
    projectRef,
    settings,
  }
}

export function getDatabaseOperations({
  headers,
  claims,
  projectRef,
}: GetDatabaseOperationsOptions): DatabaseOperations {
  return {
    async executeSql<T>(requestedProjectRef: string, options: ExecuteSqlOptions) {
      const { query, parameters, read_only: readOnly } = options
      const targetProjectRef = projectRef ?? requestedProjectRef
      const scoped = await resolveScopedProjectContext({
        claims,
        headers,
        projectRef: targetProjectRef,
      })

      const { data, error } = await executeQuery<T>({
        query,
        parameters,
        headers: scoped.headers ?? headers,
        readOnly,
        actorId: scoped.actorId,
      })

      if (error) {
        throw error
      }

      return data
    },
    async listMigrations() {
      const scoped = await resolveScopedProjectContext({ claims, headers, projectRef })
      const { data, error } = await listMigrationVersions({ headers: scoped.headers })

      if (error) {
        throw error
      }

      return data
    },
    async applyMigration(requestedProjectRef: string, options: ApplyMigrationOptions) {
      const { query, name } = options
      const targetProjectRef = projectRef ?? requestedProjectRef
      const scoped = await resolveScopedProjectContext({
        claims,
        headers,
        projectRef: targetProjectRef,
      })
      const { error } = await applyAndTrackMigrations({ query, name, headers: scoped.headers })

      if (error) {
        throw error
      }
    },
  }
}

export function getDevelopmentOperations({
  headers,
  claims,
  projectRef,
}: GetDevelopmentOperationsOptions): DevelopmentOperations {
  return {
    async getProjectUrl(requestedProjectRef) {
      const targetProjectRef = projectRef ?? requestedProjectRef
      const scoped = await resolveScopedProjectContext({
        claims,
        headers,
        projectRef: targetProjectRef,
      })
      const settings = scoped.settings ?? getProjectSettings()
      return `${settings.app_config?.protocol}://${settings.app_config?.endpoint}`
    },
    async getPublishableKeys(requestedProjectRef) {
      const targetProjectRef = projectRef ?? requestedProjectRef
      const scoped = await resolveScopedProjectContext({
        claims,
        headers,
        projectRef: targetProjectRef,
      })
      const settings = scoped.settings ?? getProjectSettings()
      const anonKey = settings.service_api_keys.find((key) => key.name === 'anon key')

      if (!anonKey) {
        throw new Error('Anon key not found in project settings')
      }

      const publishableKeysArray: ApiKey[] = [
        {
          api_key: anonKey.api_key,
          name: anonKey.name,
          type: 'anon' as ApiKeyType,
        },
      ]

      return publishableKeysArray
    },
    async generateTypescriptTypes(requestedProjectRef) {
      const targetProjectRef = projectRef ?? requestedProjectRef
      const scoped = await resolveScopedProjectContext({
        claims,
        headers,
        projectRef: targetProjectRef,
      })
      const response = await generateTypescriptTypes({ headers: scoped.headers })

      if (response instanceof ResponseError) {
        throw response
      }

      return response
    },
  }
}

export function getDebuggingOperations({
  headers,
  claims,
  projectRef,
}: GetDebuggingOperationsOptions): DebuggingOperations {
  return {
    async getLogs(requestedProjectRef: string, options: GetLogsOptions) {
      const targetProjectRef = projectRef ?? requestedProjectRef
      const sql = getLogQuery(options.service)

      const { data, error } = await retrieveAnalyticsData({
        name: 'logs.all',
        projectRef: targetProjectRef,
        params: {
          sql,
          iso_timestamp_start: options.iso_timestamp_start,
          iso_timestamp_end: options.iso_timestamp_end,
        },
      })

      if (error) {
        throw error
      }

      return data
    },
    async getSecurityAdvisors(requestedProjectRef) {
      const targetProjectRef = projectRef ?? requestedProjectRef
      const scoped = await resolveScopedProjectContext({
        claims,
        headers,
        projectRef: targetProjectRef,
      })
      const { data, error } = await getLints({ headers: scoped.headers })

      if (error) {
        throw error
      }

      return data.filter((lint) => lint.categories.includes('SECURITY'))
    },
    async getPerformanceAdvisors(requestedProjectRef) {
      const targetProjectRef = projectRef ?? requestedProjectRef
      const scoped = await resolveScopedProjectContext({
        claims,
        headers,
        projectRef: targetProjectRef,
      })
      const { data, error } = await getLints({ headers: scoped.headers })

      if (error) {
        throw error
      }

      return data.filter((lint) => lint.categories.includes('PERFORMANCE'))
    },
  }
}

export function getAccountOperations({ claims }: GetAccountOperationsOptions): AccountOperations {
  if (!claims) {
    throw new Error('Authentication required for account operations')
  }

  const platformClaims = claims as JwtPayload & Record<string, unknown>

  return {
    async listOrganizations() {
      const orgs = await listOrganizations({ claims: platformClaims })
      return orgs.map((org) => ({
        id: String(org.id),
        name: org.name,
      }))
    },
    async getOrganization(organizationId: string) {
      const orgId = Number.parseInt(organizationId, 10)
      if (!Number.isFinite(orgId)) {
        throw new Error('Invalid organization id')
      }

      const actorId = getGotrueUserId(platformClaims)
      const row = await executeQuery<{
        id: number
        name: string
        plan: string
        opt_in_tags: string[] | null
      }>({
        query: `
          select o.id, o.name, o.plan, o.opt_in_tags
          from saas.organizations o
          join saas.organization_members m on m.organization_id = o.id
          where o.id = $1 and m.gotrue_id = $2
          limit 1
        `,
        parameters: [orgId, actorId],
        actorId,
      })

      if (row.error) throw row.error
      if (!row.data?.length) {
        throw new Error('Organization not found or access denied')
      }

      const org = row.data[0]!
      return {
        id: String(org.id),
        name: org.name,
        plan: org.plan,
        allowed_release_channels: [],
        opt_in_tags: org.opt_in_tags ?? [],
      }
    },
    async listProjects() {
      const { projects } = await listProjects({ claims: platformClaims })
      return projects.map((project) => ({
        id: project.ref,
        organization_id: String(project.organization_id),
        name: project.name,
        status: project.status,
        created_at: project.inserted_at ?? new Date().toISOString(),
        region: project.region,
      }))
    },
    async getProject(projectId: string) {
      const project = await getProject({ claims: platformClaims, ref: projectId })
      if (!project) {
        throw new Error('Project not found or access denied')
      }

      return {
        id: project.ref,
        organization_id: String(project.organization_id),
        name: project.name,
        status: project.status,
        created_at: project.inserted_at ?? new Date().toISOString(),
        region: project.region,
      }
    },
    async createProject() {
      throw new Error('Creating projects via MCP is not supported on this platform')
    },
    async pauseProject() {
      throw new Error('Pausing projects via MCP is not supported on this platform')
    },
    async restoreProject() {
      throw new Error('Restoring projects via MCP is not supported on this platform')
    },
  }
}
