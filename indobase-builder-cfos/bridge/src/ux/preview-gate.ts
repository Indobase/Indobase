/**
 * Preview is a hard gate. A constructed /live/{ref}/ path is not a preview.
 * Ready only when an artifact exists (and, when checked, is reachable).
 */

export type PreviewStatus = 'absent' | 'building' | 'ready' | 'failed'

export type PreviewGateInput = {
  jobStatus?: string | null
  artifactExists?: boolean
  published?: boolean
  previewUrl?: string | null
  liveUrl?: string | null
  /** Explicit HTTP probe. null = not probed; do not invent ready from URL shape. */
  httpOk?: boolean | null
}

export type PreviewGate = {
  status: PreviewStatus
  url: string | null
}

function cleanUrl(value?: string | null): string | null {
  const url = (value || '').trim()
  return url ? url : null
}

/**
 * PREVIEW_READY only when:
 * - a build artifact exists, OR a published host is registered
 * - and if HTTP was probed, it succeeded
 * Never: preview.done = true because the agent said so.
 */
export function resolvePreviewGate(input: PreviewGateInput): PreviewGate {
  const liveUrl = cleanUrl(input.liveUrl)
  const previewUrl = cleanUrl(input.previewUrl)
  const url = liveUrl || previewUrl
  const built = Boolean(input.artifactExists || input.published)
  const jobBuilding =
    input.jobStatus === 'running' ||
    input.jobStatus === 'queued' ||
    input.jobStatus === 'awaiting_generate'

  if (input.httpOk === false && url) {
    return { status: 'failed', url }
  }
  if (built && input.httpOk !== false && url) {
    return { status: 'ready', url }
  }
  if (built && input.httpOk !== false && !url) {
    return { status: 'building', url: null }
  }
  if (jobBuilding) return { status: 'building', url: null }
  return { status: 'absent', url: null }
}

export function previewIsReady(status: PreviewStatus | null | undefined): boolean {
  return status === 'ready'
}
