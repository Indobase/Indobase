import type { JwtPayload } from '@indobaseinc/indobase-js'

/**
 * Encrypted pg-meta connection header for a project. Uses the client value when present;
 * otherwise loads the tenant (or shared) URI from the control plane for the signed-in user.
 */
export async function resolveEncryptedPgMetaConnectionForProject({
  claims,
  ref,
  incomingEncrypted,
}: {
  claims: JwtPayload
  ref: string
  incomingEncrypted?: string | null
}): Promise<string> {
  const incoming = incomingEncrypted?.trim()
  if (incoming) return incoming

  const { getProject } = await import('./platform')
  const project = await getProject({ claims: claims as any, ref })
  if (project?.connectionString?.trim()) {
    return project.connectionString
  }

  throw new Error('No database connection is configured for this project.')
}
