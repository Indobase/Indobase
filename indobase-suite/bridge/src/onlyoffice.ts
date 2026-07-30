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
  documentServerApiJs: string
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
        feedback: false,
        goback: {
          blank: false,
          text: 'Back to Workspace',
          url: '/',
        },
        // Hide upstream about/logo chrome where supported
        logo: {
          image: `${workspacePublicUrl()}/brand/indobase-logo-mark.svg`,
          imageDark: `${workspacePublicUrl()}/brand/indobase-logo-mark.svg`,
          url: workspacePublicUrl(),
        },
      },
    },
  }

  const token = signDocumentJwt(config, jwtSecret)
  return {
    documentServerApiJs: `${documentServerPublicUrl()}/web-apps/apps/api/documents/api.js`,
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
