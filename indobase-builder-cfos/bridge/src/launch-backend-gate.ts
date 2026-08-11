/**
 * Block Go Live for app types that require a provisioned backend when session.backend is missing.
 * Landing / unspecified app_type stay preview-first (static launch OK).
 *
 * Blueprints are optional starters — we do not lock Go Live to an exact schema.
 * Agents may customize collections freely after ensure/guidedBackend.
 */

import { resolveBlueprintId, type BlueprintId } from './pocketbase/blueprints.js'

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
}

export type LaunchBackendGateDenial = {
  ok: false
  code: 'backend_required' | 'architecture_required'
  message: string
}

export function assertLaunchBackendReady(
  backend: { api_url?: string; anon_key?: string; project_ref?: string } | null | undefined,
  input: LaunchBackendGateInput,
): { ok: true } | LaunchBackendGateDenial {
  const explicitRequire = input.require_backend === true
  const appType = input.app_type?.trim() ? normalizeLaunchAppType(input.app_type) : null
  const needsBackend =
    explicitRequire || (appType != null && launchAppTypeRequiresBackend(appType))

  if (!needsBackend) return { ok: true }

  const hasBackend = Boolean(backend?.api_url?.trim() && backend?.anon_key?.trim())
  if (!hasBackend) {
    const label = appType === 'saas' ? 'SaaS' : appType || 'this app type'
    return {
      ok: false,
      code: 'backend_required',
      message:
        `${label} apps need a real Indobase backend before Go Live. Call guidedBackend or ensureLogin + applySchema (starter blueprint + any custom tables), wire UI to session.backend, then launchBusiness.`,
    }
  }

  return { ok: true }
}

/**
 * Go Live gate — only requires a linked backend URL/key.
 * Schema customization is open; agents are not locked to a fixed blueprint.
 */
export async function assertLaunchArchitectureReady(
  backend: { api_url?: string; anon_key?: string; project_ref?: string } | null | undefined,
  input: LaunchBackendGateInput,
): Promise<{ ok: true } | LaunchBackendGateDenial> {
  return assertLaunchBackendReady(backend, input)
}
