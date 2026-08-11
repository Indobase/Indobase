/**
 * After ensure* / guidedBackend: persist backend on agent principals and refresh browser cookies.
 * Agent tools run in workerd without cookies — principals carry the latest api_url + anon_key.
 */
import type { Context } from 'hono'

import {
  createSessionToken,
  isGuestSession,
  resolveHandoffSecret,
  sessionCookie,
  type BackendConfig,
  type Session,
} from './auth.js'
import { updateAgentPrincipalBackend } from './agent-principal-store.js'
import type { GuidedBackendResult } from './guided-backend-chain.js'

export type EnsureBackendCarrier = {
  ok?: boolean
  backend?: BackendConfig | null
  provision_state?: string | null
  status?: string | null
}

export function backendFromEnsureResult(result: EnsureBackendCarrier): BackendConfig | null {
  if (result.ok === false) return null
  const backend = result.backend
  if (!backend?.api_url?.trim() || !backend?.anon_key?.trim()) return null
  return backend
}

export function readAgentUsernameFromRequest(c: Context): string | null {
  const username =
    (c.req.header('x-indobase-agent-username') || c.req.header('X-Indobase-Agent-Username') || '').trim()
  return username || null
}

/**
 * Stash backend on the CFOS agent principal and refresh the operator cookie when present.
 */
export async function syncBackendAfterEnsure(
  c: Context,
  browserSession: Session | null,
  result: EnsureBackendCarrier,
): Promise<BackendConfig | null> {
  const backend = backendFromEnsureResult(result)
  if (!backend) return null

  const agentUsername = readAgentUsernameFromRequest(c)
  if (agentUsername) {
    await updateAgentPrincipalBackend(agentUsername, backend)
  }

  if (browserSession && !isGuestSession(browserSession)) {
    try {
      const secret = resolveHandoffSecret()
      const updated: Session = { ...browserSession, backend }
      c.header('Set-Cookie', sessionCookie(createSessionToken(updated, secret)))
    } catch {
      // best-effort cookie refresh
    }
  }

  return backend
}

export function backendConfigFromGuidedSnapshot(
  snapshot: NonNullable<GuidedBackendResult['backend']>,
  session: { projectRef: string; projectName?: string },
): BackendConfig {
  const api = snapshot.api_url.replace(/\/+$/, '')
  const projectRef = snapshot.project_ref || session.projectRef
  return {
    api_url: snapshot.api_url,
    anon_key: snapshot.anon_key,
    auth_url: snapshot.auth_url || api,
    rest_url: snapshot.rest_url || api,
    storage_url: snapshot.storage_url || api,
    project_ref: projectRef,
    project_name: snapshot.project_name || session.projectName || projectRef,
    project_url: snapshot.project_url || api,
  }
}

export async function syncGuidedBackendResult(
  c: Context,
  browserSession: Session | null,
  session: { projectRef: string; projectName?: string },
  result: GuidedBackendResult,
): Promise<void> {
  if (!result.backend) return
  await syncBackendAfterEnsure(c, browserSession, {
    ok: result.ok,
    backend: backendConfigFromGuidedSnapshot(result.backend, session),
  })
}
