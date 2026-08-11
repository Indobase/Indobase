/**
 * Optional publish to app-host provisioner (.248) when APP_HOST_PROVISIONER_URL is set.
 * Complements static Traefik launch so pivot Phase A containers are reachable.
 */
export type AppHostPublishInput = {
  workspaceRef: string
  subdomain?: string
  title?: string
  files?: Record<string, string>
  html?: string
}

export type AppHostPublishResult =
  | { ok: true; url: string; message: string }
  | { ok: false; message: string }

export function resolveAppHostProvisioner(): { url: string; token: string } | null {
  const url = (process.env.APP_HOST_PROVISIONER_URL || '').trim().replace(/\/+$/, '')
  const token = (process.env.APP_HOST_PROVISIONER_TOKEN || process.env.APP_HOST_TOKEN || '').trim()
  if (!url || !token) return null
  return { url, token }
}

export async function publishToAppHost(input: AppHostPublishInput): Promise<AppHostPublishResult> {
  const host = resolveAppHostProvisioner()
  if (!host) {
    return { ok: false, message: 'App host provisioner is not configured' }
  }

  const files =
    input.files && Object.keys(input.files).length
      ? input.files
      : input.html?.trim()
        ? { 'index.html': input.html }
        : null
  if (!files) {
    return { ok: false, message: 'No files to publish to app host' }
  }

  const slug =
    (input.subdomain || input.workspaceRef || 'app')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'app'

  try {
    const res = await fetch(`${host.url}/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${host.token}`,
        'X-App-Host-Token': host.token,
      },
      body: JSON.stringify({
        slug,
        title: input.title || slug,
        workspace_ref: input.workspaceRef,
        files,
      }),
    })
    const json = (await res.json().catch(() => ({}))) as {
      url?: string
      message?: string
      ok?: boolean
    }
    if (!res.ok) {
      return {
        ok: false,
        message: json.message || `App host publish failed (HTTP ${res.status})`,
      }
    }
    const publicBase = (process.env.APP_HOST_PUBLIC_BASE || 'https://indobase.in').replace(/\/+$/, '')
    const url =
      typeof json.url === 'string' && json.url.startsWith('http')
        ? json.url
        : `https://${slug}.${publicBase.replace(/^https?:\/\//, '')}`
    return { ok: true, url, message: json.message || `Published to ${url}` }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'App host publish failed',
    }
  }
}
