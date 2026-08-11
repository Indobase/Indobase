/**
 * Inject Indobase public env into publish artifacts so live sites read real keys + records ABI.
 */
import type { BackendConfig } from './auth.js'
import {
  buildManagedPublicEnv,
  isManagedPublicKey,
  MANAGED_PUBLIC_KEY,
} from './pocketbase/managed.js'

const ENV_SCRIPT_RE = /<script[^>]*>\s*window\.__INDOBASE_ENV__\s*=\s*\{[\s\S]*?\}\s*;?\s*<\/script>/i

export function buildIndobasePublicEnv(backend: BackendConfig): Record<string, string> {
  const api = backend.api_url.replace(/\/+$/, '')
  const managed =
    isManagedPublicKey(backend.anon_key) ||
    Boolean(backend.public_env?.INDOBASE_BACKEND_KIND === 'records') ||
    (backend.rest_url || '').includes('/api/collections')

  if (managed && backend.project_ref) {
    const fromManaged = buildManagedPublicEnv({
      publicUrl: api,
      appId: backend.project_ref,
    })
    return {
      ...fromManaged,
      ...(backend.public_env || {}),
      INDOBASE_URL: api,
      INDOBASE_ANON_KEY: MANAGED_PUBLIC_KEY,
      PROJECT_REF: backend.project_ref,
    }
  }

  // Legacy Studio / Kong-shaped backends keep /auth/v1 + /rest/v1 when already set.
  const auth =
    backend.auth_url ||
    (backend.public_env?.INDOBASE_AUTH_URL) ||
    `${api}/auth/v1`
  const rest =
    backend.rest_url ||
    (backend.public_env?.INDOBASE_REST_URL) ||
    `${api}/rest/v1/`

  return {
    INDOBASE_URL: api,
    INDOBASE_ANON_KEY: backend.anon_key,
    PROJECT_REF: backend.project_ref || '',
    INDOBASE_AUTH_URL: auth,
    INDOBASE_REST_URL: rest,
    INDOBASE_STORAGE_URL: backend.storage_url || `${api}/storage/v1`,
    VITE_INDOBASE_URL: api,
    VITE_INDOBASE_ANON_KEY: backend.anon_key,
    NEXT_PUBLIC_INDOBASE_URL: api,
    NEXT_PUBLIC_INDOBASE_ANON_KEY: backend.anon_key,
    ...(backend.public_env || {}),
  }
}

function envScriptTag(env: Record<string, string>): string {
  const helper = `window.__INDOBASE_COLLECTION__=function(n){var p=(window.__INDOBASE_ENV__||{}).INDOBASE_COLLECTION_PREFIX||'';return p+String(n||'').toLowerCase().replace(/[^a-z0-9_]/g,'_');};`
  return `<script>window.__INDOBASE_ENV__=${JSON.stringify(env)};${helper}</script>`
}

export function injectIndobaseEnvIntoHtml(html: string, env: Record<string, string>): string {
  if (!html.trim()) return html
  const script = envScriptTag(env)
  if (ENV_SCRIPT_RE.test(html)) {
    return html.replace(ENV_SCRIPT_RE, script)
  }
  if (/window\.__INDOBASE_ENV__/i.test(html)) {
    // Partial stub — prepend authoritative env
    if (/<\/head>/i.test(html)) {
      return html.replace(/<\/head>/i, `${script}\n</head>`)
    }
    return `${script}\n${html}`
  }
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${script}\n</head>`)
  }
  if (/<body[\s>]/i.test(html)) {
    return html.replace(/<body/i, `${script}\n<body`)
  }
  return `${script}\n${html}`
}

function injectIntoJsModule(content: string, env: Record<string, string>): string {
  if (/__INDOBASE_ENV__/i.test(content) && content.includes(env.INDOBASE_URL || '')) {
    return content
  }
  const preamble = `globalThis.__INDOBASE_ENV__=Object.assign({},globalThis.__INDOBASE_ENV__||{},${JSON.stringify(env)});\n`
  return preamble + content
}

function injectIntoEnvFile(content: string, env: Record<string, string>): string {
  const lines = Object.entries(env).map(([k, v]) => `${k}=${v}`)
  const block = lines.join('\n')
  if (!content.trim()) return block + '\n'
  // Replace known keys, append missing
  let next = content
  for (const [k, v] of Object.entries(env)) {
    const re = new RegExp(`^${k}=.*$`, 'm')
    if (re.test(next)) next = next.replace(re, `${k}=${v}`)
    else next = `${next.trimEnd()}\n${k}=${v}\n`
  }
  return next
}

export function injectIndobaseEnvIntoLaunchContent(input: {
  html?: string
  files?: Record<string, string>
  backend?: BackendConfig | null
}): { html?: string; files?: Record<string, string> } {
  if (!input.backend?.api_url?.trim() || !input.backend.anon_key?.trim()) {
    return { html: input.html, files: input.files }
  }
  const env = buildIndobasePublicEnv(input.backend)

  if (input.files && typeof input.files === 'object') {
    const files = { ...input.files }
    for (const [relPath, content] of Object.entries(files)) {
      if (typeof content !== 'string') continue
      if (/\.html?$/i.test(relPath)) {
        files[relPath] = injectIndobaseEnvIntoHtml(content, env)
      } else if (/\.(js|mjs|cjs)$/i.test(relPath)) {
        files[relPath] = injectIntoJsModule(content, env)
      } else if (/(^|\/)\.env(\.|$)/i.test(relPath) || /\.env$/i.test(relPath)) {
        files[relPath] = injectIntoEnvFile(content, env)
      }
    }
    return { files }
  }

  if (typeof input.html === 'string' && input.html.trim()) {
    return { html: injectIndobaseEnvIntoHtml(input.html, env) }
  }

  return { html: input.html, files: input.files }
}
