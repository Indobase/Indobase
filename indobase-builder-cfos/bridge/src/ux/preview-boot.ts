/**
 * Preview boot handshake for the Builder iframe.
 * Parent must NEVER read iframe.contentDocument (cross-origin SecurityError).
 * The preview document posts a typed message; parent validates origin + projectRef + hash.
 */

export const PREVIEW_BOOT_EVENT = 'INDOBASE_PREVIEW_READY' as const
export const PREVIEW_BOOT_ERROR = 'INDOBASE_PREVIEW_ERROR' as const

export type PreviewBootMessage = {
  type: typeof PREVIEW_BOOT_EVENT | typeof PREVIEW_BOOT_ERROR
  projectRef: string
  artifactHash: string
  applicationType?: string
  runtimeVersion: 'v1'
}

export function isTrustedPreviewOrigin(origin: string, allowed: string[]): boolean {
  const o = (origin || '').trim().replace(/\/+$/, '')
  if (!o || o === 'null') return false
  return allowed.some((a) => a.replace(/\/+$/, '') === o)
}

export function parsePreviewBootMessage(
  data: unknown,
  expected: { projectRef: string; artifactHash?: string | null; allowedOrigins: string[] },
  eventOrigin: string,
): { ok: true; message: PreviewBootMessage } | { ok: false; reason: string } {
  if (!isTrustedPreviewOrigin(eventOrigin, expected.allowedOrigins)) {
    return { ok: false, reason: 'origin' }
  }
  if (!data || typeof data !== 'object') return { ok: false, reason: 'payload' }
  const msg = data as PreviewBootMessage
  if (msg.type !== PREVIEW_BOOT_EVENT && msg.type !== PREVIEW_BOOT_ERROR) {
    return { ok: false, reason: 'type' }
  }
  if (msg.runtimeVersion !== 'v1') return { ok: false, reason: 'version' }
  if (!msg.projectRef || msg.projectRef !== expected.projectRef) return { ok: false, reason: 'projectRef' }
  if (expected.artifactHash && msg.artifactHash && msg.artifactHash !== expected.artifactHash) {
    return { ok: false, reason: 'artifactHash' }
  }
  return { ok: true, message: msg }
}

/** Injected into generated HTML. Speaks to parent via postMessage only. */
export function previewBootScript(input: {
  projectRef: string
  artifactHash: string
  applicationType: string
}): string {
  const payload = JSON.stringify({
    type: PREVIEW_BOOT_EVENT,
    projectRef: input.projectRef,
    artifactHash: input.artifactHash,
    applicationType: input.applicationType,
    runtimeVersion: 'v1',
  })
  return `<script data-ib-boot="1">window.__IB_PREVIEW_BOOT__=${payload};try{if(window.parent&&window.parent!==window){window.parent.postMessage(window.__IB_PREVIEW_BOOT__, '*')}}catch(e){}</script>`
}

export function injectPreviewBoot(html: string, input: {
  projectRef: string
  artifactHash: string
  applicationType: string
}): string {
  const text = html || ''
  if (/data-ib-boot="1"|__IB_PREVIEW_BOOT__/.test(text)) return text
  const script = previewBootScript(input)
  if (/<\/body>/i.test(text)) return text.replace(/<\/body>/i, `${script}</body>`)
  return `${text}${script}`
}
