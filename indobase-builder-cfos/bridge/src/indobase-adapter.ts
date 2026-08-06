/**
 * Gen 3 — bridge uses @indobase/cloudflare-adapter for session → Generation Context
 * and Indobase naming. Durable workspace commits stay on Indobase Commands (Phase 2).
 *
 * @see docs/BUILDER-GEN3.md
 */
import {
  createCloudflareOsAdapter,
  sessionToAgentContext,
  stripVendorBranding,
  type AgentSessionContext,
  type BridgeSessionLike,
  type CloudflareOsAdapter,
} from '@indobase/cloudflare-adapter'

import type { Session } from './auth.js'

let singleton: CloudflareOsAdapter | null = null

export function getCloudflareOsAdapter(): CloudflareOsAdapter {
  if (!singleton) {
    singleton = createCloudflareOsAdapter({
      indobaseProxyPath: '/api/indobase/proxy/',
    })
  }
  return singleton
}

export function sessionToBridgeLike(session: Session): BridgeSessionLike {
  return {
    email: session.email,
    projectRef: session.projectRef,
    projectName: session.projectName,
    orgSlug: session.orgSlug,
    studioUrl: session.studioUrl,
    backend: session.backend
      ? {
          api_url: session.backend.api_url,
          anon_key: session.backend.anon_key,
          project_ref: session.backend.project_ref,
          auth_url: session.backend.auth_url,
          rest_url: session.backend.rest_url,
          storage_url: session.backend.storage_url,
        }
      : null,
  }
}

/** SSO session → Indobase agent / generation context (adapter-owned). */
export function buildAgentSessionContext(session: Session): AgentSessionContext {
  return sessionToAgentContext(sessionToBridgeLike(session), {
    indobaseProxyPath: '/api/indobase/proxy/',
  })
}

/** Customer-safe agent hint for chrome copy / clipboard. */
export function buildAgentHint(session: Session): string {
  return buildAgentSessionContext(session).agentHint
}

export { stripVendorBranding }
