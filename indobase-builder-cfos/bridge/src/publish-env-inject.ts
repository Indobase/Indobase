/**
 * Inject Indobase public env into static HTML at publish time so live sites can read real keys.
 */
import type { BackendConfig } from './auth.js'

const ENV_MARKER = /__INDOBASE_ENV__|VITE_INDOBASE_URL|NEXT_PUBLIC_INDOBASE_URL|INDOBASE_ANON_KEY/i

export function buildIndobasePublicEnv(backend: BackendConfig): Record<string, string> {
  const api = backend.api_url.replace(/\/+$/, '')
  return {
    INDOBASE_URL: api,
    INDOBASE_ANON_KEY: backend.anon_key,
    PROJECT_REF: backend.project_ref || '',
    INDOBASE_AUTH_URL: backend.auth_url || `${api}/auth/v1`,
    INDOBASE_REST_URL: backend.rest_url || `${api}/rest/v1/`,
    VITE_INDOBASE_URL: api,
    VITE_INDOBASE_ANON_KEY: backend.anon_key,
    NEXT_PUBLIC_INDOBASE_URL: api,
    NEXT_PUBLIC_INDOBASE_ANON_KEY: backend.anon_key,
  }
}

export function injectIndobaseEnvIntoHtml(html: string, env: Record<string, string>): string {
  if (!html.trim() || ENV_MARKER.test(html)) return html
  const script = `<script>window.__INDOBASE_ENV__=${JSON.stringify(env)};</script>`
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${script}\n</head>`)
  }
  if (/<body[\s>]/i.test(html)) {
    return html.replace(/<body/i, `${script}\n<body`)
  }
  return `${script}\n${html}`
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
      }
    }
    return { files }
  }

  if (typeof input.html === 'string' && input.html.trim()) {
    return { html: injectIndobaseEnvIntoHtml(input.html, env) }
  }

  return { html: input.html, files: input.files }
}
