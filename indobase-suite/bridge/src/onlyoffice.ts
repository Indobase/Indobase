/**
 * Document editor JWT + config for Indobase Workspace.
 * Engine uses HS256 JWT when JWT_ENABLED (shared secret with the documentservice container).
 * Customer chrome never names the upstream engine.
 */
import { createHmac } from 'node:crypto'

import type { Session } from './auth.js'
import {
  documentTypeForExt,
  mintFileAccessToken,
  type WorkspaceFileMeta,
} from './files.js'

export function resolveDocumentJwtSecret(): string {
  const secret = (
    process.env.DOCUMENT_JWT_SECRET ||
    process.env.JWT_SECRET ||
    process.env.SUITE_HANDOFF_SECRET ||
    ''
  ).trim()
  if (secret.length < 32) {
    throw new Error('DOCUMENT_JWT_SECRET missing or shorter than 32 chars')
  }
  return secret
}

export function isDocumentServerConfigured(): boolean {
  return Boolean((process.env.DOCUMENT_SERVER_URL || '').trim())
}

function b64urlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function signDocumentJwt(payload: Record<string, unknown>, secret: string): string {
  const header = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64urlEncode(JSON.stringify(payload))
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest()
  return `${header}.${body}.${b64urlEncode(sig)}`
}

/** Public origin browsers use (Traefik → bridge). */
export function workspacePublicUrl(): string {
  return (
    process.env.WORKSPACE_PUBLIC_URL ||
    process.env.SUITE_PUBLIC_URL ||
    'https://workspace.indobase.in'
  ).replace(/\/+$/, '')
}

/**
 * Origin DocumentServer uses to download/callback into the bridge.
 * In Compose this is the internal service URL; locally it may equal the public URL.
 */
export function bridgeInternalUrl(): string {
  return (
    process.env.BRIDGE_INTERNAL_URL ||
    process.env.DOCUMENT_CALLBACK_BASE_URL ||
    workspacePublicUrl()
  ).replace(/\/+$/, '')
}

/** Browser-facing DocumentServer base (often same host via /ds proxy). */
export function documentServerPublicUrl(): string {
  const configured = (process.env.DOCUMENT_SERVER_PUBLIC_URL || '').trim()
  if (configured) return configured.replace(/\/+$/, '')
  return `${workspacePublicUrl()}/ds`
}

export function documentServerUpstream(): string {
  return (process.env.DOCUMENT_SERVER_URL || '').replace(/\/+$/, '')
}

export type EditorConfigBundle = {
  /** Absolute DocsAPI script URL (under /ds). */
  documentServerApiJs: string
  /**
   * DocumentServer origin for DocsAPI when the editor is mounted under a path
   * prefix (`/ds`). Without this, some builds mis-resolve coauthoring/cache URLs
   * and the editor UI can load while document open fails with "Download failed".
   */
  documentServerUrl: string
  config: Record<string, unknown>
  token: string
}

export function buildEditorConfig(opts: {
  file: WorkspaceFileMeta
  session: Session
  handoffSecret: string
  mode?: 'edit' | 'view'
}): EditorConfigBundle {
  const jwtSecret = resolveDocumentJwtSecret()
  const access = mintFileAccessToken(opts.handoffSecret, opts.session.projectRef, opts.file.id)
  const internal = bridgeInternalUrl()
  const canEdit = opts.session.canEdit && opts.mode !== 'view'
  const documentKey = `${opts.file.id}-${opts.file.updatedAt.replace(/[^0-9]/g, '').slice(0, 14)}`

  const config = {
    documentType: documentTypeForExt(opts.file.ext),
    document: {
      fileType: opts.file.ext,
      key: documentKey.slice(0, 128),
      title: opts.file.name,
      url: `${internal}/api/files/${encodeURIComponent(opts.file.id)}/content?access=${encodeURIComponent(access)}`,
      permissions: {
        edit: canEdit,
        download: true,
        print: true,
        comment: canEdit,
        review: canEdit,
      },
    },
    editorConfig: {
      callbackUrl: `${internal}/api/files/${encodeURIComponent(opts.file.id)}/callback?access=${encodeURIComponent(access)}`,
      mode: canEdit ? 'edit' : 'view',
      lang: 'en',
      user: {
        id: opts.session.gotrueId.slice(0, 64),
        name: opts.session.email.split('@')[0] || opts.session.email,
      },
      customization: {
        autosave: true,
        forcesave: true,
        compactHeader: true,
        compactToolbar: true,
        feedback: false,
        help: false,
        // CE may ignore about:false — still set so EE/whitelabel builds hide it
        about: false,
        goback: {
          blank: false,
          text: 'Back to Workspace',
          url: '/',
        },
        // Logo / customer fields are honored on commercial builds; CE often
        // still shows upstream strings in About — see NOTICE.md.
        logo: {
          image: `${workspacePublicUrl()}/brand/indobase-logo-mark.svg`,
          imageDark: `${workspacePublicUrl()}/brand/indobase-logo-mark.svg`,
          imageEmbedded: `${workspacePublicUrl()}/brand/indobase-logo-mark.svg`,
          url: workspacePublicUrl(),
        },
        customer: {
          name: 'Indobase',
          www: 'https://indobase.in',
          mail: 'support@indobase.in',
          info: 'Indobase Workspace',
          logo: `${workspacePublicUrl()}/brand/indobase-logo-mark.svg`,
          logoDark: `${workspacePublicUrl()}/brand/indobase-logo-mark.svg`,
        },
      },
    },
  }

  const token = signDocumentJwt(config, jwtSecret)
  const dsPublic = documentServerPublicUrl()
  return {
    documentServerApiJs: `${dsPublic}/web-apps/apps/api/documents/api.js`,
    // Trailing slash required by DocsAPI path joining.
    documentServerUrl: `${dsPublic}/`,
    config,
    token,
  }
}

export async function documentServerHealth(): Promise<boolean> {
  const upstream = documentServerUpstream()
  if (!upstream) return false
  try {
    const res = await fetch(`${upstream}/healthcheck`, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return false
    const text = (await res.text()).trim().toLowerCase()
    return text === 'true' || text.includes('true')
  } catch {
    return false
  }
}

/** Path prefixes proxied from the bridge to DocumentServer (browser same-origin /ds). */
export const DOCUMENT_SERVER_PROXY_PREFIXES = [
  '/web-apps',
  '/cache',
  '/coauthoring',
  '/doceditor',
  '/sdkjs',
  '/sdkjs-plugins',
  '/fonts',
  '/dictionaries',
  '/common',
  '/downloadas',
  '/converter',
  '/healthcheck',
  // `/welcome` is intercepted by the bridge (Indobase page) — listed so
  // isDocumentServerProxyPath still recognizes the path for routing guards.
  '/welcome',
] as const

export function isDocumentServerProxyPath(pathname: string): boolean {
  if (pathname === '/ds' || pathname.startsWith('/ds/')) return true
  return DOCUMENT_SERVER_PROXY_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )
}

/** Map public path → upstream DocumentServer path (strip /ds prefix when present). */
export function documentServerUpstreamPath(pathname: string): string {
  if (pathname === '/ds') return '/'
  if (pathname.startsWith('/ds/')) return pathname.slice(3) || '/'
  return pathname
}

/**
 * Rewrite DocumentServer redirect Location so `/welcome` (etc.) stay under `/ds`
 * when the browser requested a `/ds…` path.
 */
export function rewriteDocumentServerLocation(location: string, requestPathname: string): string {
  const viaDs = requestPathname === '/ds' || requestPathname.startsWith('/ds/')
  if (!viaDs) return location

  try {
    const publicBase = documentServerPublicUrl() // e.g. https://workspace.indobase.in/ds
    const workspace = workspacePublicUrl()
    const abs = new URL(location, `${workspace}/`)
    // Already under /ds
    if (abs.pathname === '/ds' || abs.pathname.startsWith('/ds/')) {
      return abs.toString()
    }
    // Same-host absolute or root-relative engine path → prefix /ds
    if (abs.origin === new URL(workspace).origin || location.startsWith('/')) {
      const prefixed = `${publicBase}${abs.pathname === '/' ? '/' : abs.pathname}${abs.search}${abs.hash}`
      return prefixed
    }
    return location
  } catch {
    if (location.startsWith('/') && !location.startsWith('/ds')) {
      return `/ds${location}`
    }
    return location
  }
}

/** Hop-by-hop / framing headers must not be forwarded from DocumentServer. */
export const PROXY_SKIP_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'content-encoding',
  'content-length',
  'server',
  'alt-svc',
])
