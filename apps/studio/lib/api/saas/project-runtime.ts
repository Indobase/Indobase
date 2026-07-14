import { IS_SAAS } from 'lib/constants'
import { PROJECT_STATUS } from 'lib/constants/infrastructure'

type ProjectRuntime = {
  status?: string
  connectionString?: string | null
  hasDedicatedDatabase?: boolean
}

/** Studio can run pg-meta / SQL against this project (dedicated DB or fully healthy). */
export function isProjectDatabaseReady(project?: ProjectRuntime): boolean {
  if (!project) return false
  // SaaS: never treat a project as SQL-ready on shared control-plane alone.
  if (IS_SAAS && project.hasDedicatedDatabase === false) return false
  if (project.status === PROJECT_STATUS.ACTIVE_HEALTHY) return true
  if (IS_SAAS && Boolean(project.connectionString?.trim())) return true
  return false
}

/** SaaS projects on legacy shared control-plane DB need a per-tenant database for auth.users. */
export function projectNeedsDedicatedDatabase(project?: ProjectRuntime): boolean {
  return IS_SAAS && project?.hasDedicatedDatabase === false
}

/** Storage and other platform APIs that use the shared Kong admin client (not per-tenant REST). */
export function isProjectPlatformApiReady(project?: ProjectRuntime): boolean {
  if (!project) return false
  if (IS_SAAS) return true
  return project.status === PROJECT_STATUS.ACTIVE_HEALTHY
}
