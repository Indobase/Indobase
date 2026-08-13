/**
 * PocketBase IdentityAdapter — hidden OS identity implementation (ADR 0008).
 * Session / hint / auth chrome must import this façade, not PocketBase HTTP.
 */
import type {
  IdentityAdapter,
  IdentityOtpStartInput,
  IdentityOtpVerifyInput,
  IdentitySession,
} from '@indobase/platform'
import type { OsWorkspaceSession } from '@indobase/platform-api'

import { managedBackendOtpStart, managedBackendOtpVerify } from './otp.js'

export function identitySessionFromOsWorkspace(session: OsWorkspaceSession): IdentitySession {
  const backend = session.backend
  return {
    identity: {
      id: session.gotrue_id,
      email: session.email,
      displayName: session.workspace_name,
    },
    business: {
      ref: session.workspace_ref,
      name: session.workspace_name,
    },
    workspace: {
      ref: session.workspace_ref,
      slug: session.organization_slug,
      name: session.workspace_name,
    },
    provisionState: session.provision_state,
    dataPlane: backend
      ? {
          url: backend.api_url,
          anonKey: backend.anon_key,
          extra: backend as unknown as Record<string, unknown>,
        }
      : undefined,
  }
}

export function osWorkspaceFromIdentitySession(session: IdentitySession): OsWorkspaceSession {
  const extra = session.dataPlane?.extra as OsWorkspaceSession['backend'] | undefined
  const provision =
    session.provisionState === 'none' ||
    session.provisionState === 'provisioning' ||
    session.provisionState === 'ready'
      ? session.provisionState
      : 'ready'
  return {
    gotrue_id: session.identity.id,
    email: session.identity.email,
    workspace_ref: session.workspace.ref || session.business.ref,
    organization_slug: session.workspace.slug || 'indobase',
    workspace_name:
      session.workspace.name ||
      session.business.name ||
      session.identity.displayName ||
      'My business',
    provision_state: provision,
    backend: extra ?? null,
  }
}

export const pocketBaseIdentityAdapter: IdentityAdapter = {
  startOtp(input: IdentityOtpStartInput) {
    return managedBackendOtpStart({ name: input.name, email: input.email })
  },
  async verifyOtp(input: IdentityOtpVerifyInput) {
    const result = await managedBackendOtpVerify({
      name: input.name,
      email: input.email,
      token: input.token,
    })
    if (!result.ok) return result
    return { ok: true, session: identitySessionFromOsWorkspace(result.session) }
  },
}
