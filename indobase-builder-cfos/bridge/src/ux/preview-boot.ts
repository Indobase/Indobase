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

/** Hide Vite/React engine overlays and swallow internals on published pages. */
export function customerSafePageScript(): string {
  return `<script data-ib-safe="1">(function(){
function hide(){
  try{
    document.querySelectorAll('vite-error-overlay,#vite-error-overlay,[data-vite-dev-id]').forEach(function(n){n.remove()});
  }catch(e){}
}
function leak(m){
  return /is not defined|ReferenceError|TypeError|SyntaxError|persistCatalog|http\\.ts|catalog-domain|ECONNREFUSED|undici|PocketBase|backend_unavailable/i.test(String(m||''));
}
window.addEventListener('error', function(ev){
  if(leak(ev&&ev.message)||leak(ev&&ev.error&&ev.error.message)){
    ev.preventDefault();
    hide();
  }
});
window.addEventListener('unhandledrejection', function(ev){
  var r=ev&&ev.reason;
  if(leak(r&&(r.message||r))){ ev.preventDefault(); hide(); }
});
try{
  if(typeof MutationObserver!=='undefined' && document.documentElement){
    new MutationObserver(hide).observe(document.documentElement,{childList:true,subtree:true});
  }
}catch(e){}
hide();
})();</script>`
}

export function injectCustomerSafePage(html: string): string {
  const text = html || ''
  if (/data-ib-safe="1"/.test(text)) return text
  const script = customerSafePageScript()
  if (/<head[\s>]/i.test(text)) return text.replace(/<head([^>]*)>/i, `<head$1>${script}`)
  return `${script}${text}`
}

export function injectPreviewBoot(html: string, input: {
  projectRef: string
  artifactHash: string
  applicationType: string
}): string {
  const text = injectCustomerSafePage(html || '')
  if (/data-ib-boot="1"|__IB_PREVIEW_BOOT__/.test(text)) return text
  const script = previewBootScript(input)
  if (/<\/body>/i.test(text)) return text.replace(/<\/body>/i, `${script}</body>`)
  return `${text}${script}`
}
