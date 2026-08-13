/**
 * PocketBase CapabilityAdapter — auth / business data / storage ensure.
 * Customer copy stays Indobase-shaped; the engine is never named.
 */
import type { CapabilityAdapter } from '@indobase/platform'

import { ensureManagedBackend, isManagedBackendConfigured, sanitizeAppId } from './managed.js'

export const pocketBaseCapabilityAdapter: CapabilityAdapter = {
  async ensure({ businessRef, capabilityId }) {
    if (!isManagedBackendConfigured()) {
      return { ok: false, state: 'none' }
    }
    const id = String(capabilityId)
    if (id !== 'auth' && id !== 'businessData' && id !== 'storage' && id !== 'catalog') {
      return { ok: false, state: 'none' }
    }
    try {
      const appId = sanitizeAppId(businessRef)
      const ensured = await ensureManagedBackend({ appId, seed: businessRef })
      return { ok: Boolean(ensured), state: ensured ? 'ready' : 'failed' }
    } catch {
      return { ok: false, state: 'failed' }
    }
  },
}
