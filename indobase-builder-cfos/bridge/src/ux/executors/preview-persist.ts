import type { Session } from '../../auth.js'
import {
  getLatestProductionLaunchJob,
  rememberProductionLaunchJob,
  type ProductionLaunchDeps,
} from '../../production-launch/index.js'
import { readLiveFile, writeDraftPreview } from '../../static-launch.js'
import type { PersistedWorkspaceRuntime } from '../runtime-store.js'
import { appendRuntimeEvent, getWorkspaceRuntime, issueRuntimeCommand, patchWorkspaceRuntime } from '../runtime-store.js'

export function subdomainFromLiveUrl(url: string | null | undefined): string | undefined {
  const raw = (url || '').trim()
  if (!raw) return undefined
  try {
    const host = new URL(raw).hostname.toLowerCase()
    const label = host.split('.')[0]
    return label && label !== 'www' ? label : undefined
  } catch {
    return undefined
  }
}

export async function persistPreviewHtml(input: {
  session: Session
  runtime: PersistedWorkspaceRuntime
  html: string
  files: Record<string, string>
  mutation: string
  eventKind: string
  eventMessage: string
  launchDeps?: ProductionLaunchDeps
}): Promise<PersistedWorkspaceRuntime> {
  const { session } = input
  const written = await writeDraftPreview({
    workspaceRef: session.projectRef,
    title: input.runtime.spec?.businessName || session.projectName || 'Preview',
    files: input.files,
  })
  const command = issueRuntimeCommand(session.projectRef, 'runtime.preview', {
    mutation: input.mutation,
  })
  patchWorkspaceRuntime(session.projectRef, {
    preview: {
      ...input.runtime.preview,
      status: 'ready',
      url: input.runtime.preview.url || written.previewUrl,
      artifactRef: written.artifactRef,
      contentHash: written.contentHash,
      httpOk: true,
    },
    artifactHtml: input.html,
    artifactFiles: input.files,
    lastCommandId: command.id,
  })
  appendRuntimeEvent(session.projectRef, {
    kind: input.eventKind,
    message: input.eventMessage,
    commandId: command.id,
  })
  const job = getLatestProductionLaunchJob(session.projectRef)
  if (job && job.status !== 'live') {
    rememberProductionLaunchJob({
      ...job,
      html: input.html,
      files: { ...(job.files || {}), 'index.html': input.html },
    })
  }
  return getWorkspaceRuntime(session.projectRef) || input.runtime
}

export async function loadPreviewHtml(
  session: Session,
  runtime: PersistedWorkspaceRuntime,
): Promise<string> {
  let html = runtime.artifactHtml || runtime.artifactFiles?.['index.html'] || ''
  if (!html) {
    const disk = await readLiveFile(session.projectRef, 'index.html')
    html = disk?.body?.toString('utf8') || ''
  }
  const job = getLatestProductionLaunchJob(session.projectRef)
  if (!html) html = job?.html || job?.files?.['index.html'] || ''
  return html
}
