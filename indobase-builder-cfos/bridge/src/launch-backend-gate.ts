/**
 * Block Go Live for app types that require a provisioned + wired backend.
 * Landing-only stays preview-first. Content inference closes the omit-app_type loophole.
 */

import { resolveBlueprintId, type BlueprintId } from './pocketbase/blueprints.js'
import { getManagedBackendConfig } from './pocketbase/managed.js'
import {
  assertLaunchWireReady,
  collectLaunchText,
  contentLooksLikeDataApp,
  inferAppTypeFromContent,
} from './wire-proof.js'
import type { BackendConfig } from './auth.js'

export type LaunchAppType =
  | 'landing'
  | 'saas'
  | 'ecommerce'
  | 'booking'
  | 'blog'
  | 'dashboard'
  | 'other'

export function normalizeLaunchAppType(raw: string | null | undefined): LaunchAppType {
  const t = (raw || '').trim().toLowerCase()
  if (t === 'landing' || t === 'marketing' || t === 'static') return 'landing'
  if (t === 'saas' || t === 'software' || t === 'b2b') return 'saas'
  if (t === 'ecommerce' || t === 'shop' || t === 'store' || t === 'commerce') return 'ecommerce'
  if (t === 'booking' || t === 'appointments' || t === 'scheduling') return 'booking'
  if (t === 'blog' || t === 'content' || t === 'cms') return 'blog'
  if (t === 'dashboard' || t === 'admin' || t === 'internal') return 'dashboard'
  return 'other'
}

/** App types that must not Go Live without session.backend (auth/data path). */
export function launchAppTypeRequiresBackend(appType: LaunchAppType): boolean {
  return (
    appType === 'saas' ||
    appType === 'booking' ||
    appType === 'dashboard' ||
    appType === 'ecommerce' ||
    appType === 'blog'
  )
}

export function blueprintForLaunchAppType(appType: LaunchAppType): BlueprintId | null {
  if (appType === 'landing' || appType === 'other') return null
  return resolveBlueprintId(appType)
}

export type LaunchBackendGateInput = {
  app_type?: string | null
  require_backend?: boolean | null
  /** Workspace / app id used for collection prefix (session.projectRef). */
  projectRef?: string | null
  html?: string | null
  files?: Record<string, string> | null
  /** When true, skip wire proof (legacy callers). */
  skip_wire_proof?: boolean | null
}

export type LaunchBackendGateDenial = {
  ok: false
  code: 'backend_required' | 'architecture_required' | 'wire_required' | 'backend_unhealthy'
  message: string
}

export function resolveEffectiveAppType(input: LaunchBackendGateInput): LaunchAppType {
  if (input.app_type?.trim()) {
    return normalizeLaunchAppType(input.app_type)
  }
  const text = collectLaunchText({ html: input.html, files: input.files })
  const inferred = inferAppTypeFromContent(text)
  if (inferred) return normalizeLaunchAppType(inferred)
  if (contentLooksLikeDataApp(text)) return 'saas'
  return 'landing'
}

export function assertLaunchBackendReady(
  backend: { api_url?: string; anon_key?: string; project_ref?: string } | null | undefined,
  input: LaunchBackendGateInput,
): { ok: true; appType: LaunchAppType; needsBackend: boolean } | LaunchBackendGateDenial {
  const explicitRequire = input.require_backend === true
  const appType = resolveEffectiveAppType(input)
  const text = collectLaunchText({ html: input.html, files: input.files })
  const needsBackend =
    explicitRequire ||
    (appType !== 'landing' && launchAppTypeRequiresBackend(appType)) ||
    (appType === 'other' && contentLooksLikeDataApp(text))

  if (!needsBackend) return { ok: true, appType, needsBackend: false }

  const hasBackend = Boolean(backend?.api_url?.trim() && backend?.anon_key?.trim())
  if (!hasBackend) {
    const label = appType === 'saas' ? 'SaaS' : appType || 'this app type'
    return {
      ok: false,
      code: 'backend_required',
      message:
        `${label} apps need a real Indobase backend before Go Live. Call guidedBackend or ensureLogin + applySchema (starter blueprint + any custom tables), wire UI to session.backend (collection prefix + /api/collections/…/records), then launchBusiness.`,
    }
  }

  return { ok: true, appType, needsBackend: true }
}

/**
 * Go Live gate — linked backend + wire proof for data apps + optional health.
 */
export async function assertLaunchArchitectureReady(
  backend: BackendConfig | { api_url?: string; anon_key?: string; project_ref?: string } | null | undefined,
  input: LaunchBackendGateInput,
): Promise<{ ok: true; appType: LaunchAppType } | LaunchBackendGateDenial> {
  const ready = assertLaunchBackendReady(backend, input)
  if (!ready.ok) return ready

  if (ready.needsBackend && getManagedBackendConfig()) {
    try {
      const config = getManagedBackendConfig()!
      const health = await fetch(`${config.adminUrl}/api/health`).catch(() => null)
      if (!health?.ok) {
        return {
          ok: false,
          code: 'backend_unhealthy',
          message:
            'Indobase backend is unreachable. Retry ensureDatabase / guidedBackend after the backend is healthy.',
        }
      }
    } catch {
      return {
        ok: false,
        code: 'backend_unhealthy',
        message: 'Indobase backend health check failed.',
      }
    }
  }

  if (ready.needsBackend && input.skip_wire_proof !== true) {
    const wire = assertLaunchWireReady({
      html: input.html,
      files: input.files,
      backend: backend as BackendConfig | null,
      requireWire: true,
    })
    if (!wire.ok) return wire
  }

  return { ok: true, appType: ready.appType }
}
