import type { Session } from '../../auth.js'
import {
  getLatestProductionLaunchJob,
  rememberProductionLaunchJob,
  type ProductionLaunchDeps,
} from '../../production-launch/index.js'
import { flattenSafeFiles, isViteReactProject } from '../../production-launch/react-project.js'
import { buildViteReactApp } from '../../production-launch/vite-build.js'
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
  const incoming = flattenSafeFiles(input.files)
  const viteSource = isViteReactProject(incoming)
  let diskFiles = incoming
  let html = input.html
  let artifactFiles = incoming
  if (viteSource) {
    const compiled = input.launchDeps?.buildReact
      ? await input.launchDeps.buildReact({ cwd: session.projectRef, files: incoming })
      : await buildViteReactApp(incoming, session.projectRef)
    if (!compiled.ok) {
      const command = issueRuntimeCommand(session.projectRef, 'runtime.preview', {
        mutation: input.mutation,
      })
      patchWorkspaceRuntime(session.projectRef, {
        preview: {
          ...input.runtime.preview,
          status: 'failed',
          httpOk: false,
        },
        artifactHtml: input.html,
        artifactFiles: incoming,
        lastCommandId: command.id,
      })
      appendRuntimeEvent(session.projectRef, {
        kind: 'runtime.preview.failed',
        message: `react_build_failed: ${compiled.message || 'vite build failed'}`,
        commandId: command.id,
      })
      const job = getLatestProductionLaunchJob(session.projectRef)
      if (job && job.status !== 'live') {
        rememberProductionLaunchJob({
          ...job,
          files: { ...(job.files || {}), ...incoming },
        })
      }
      return getWorkspaceRuntime(session.projectRef) || input.runtime
    }
    diskFiles = compiled.files
    html = compiled.html
    artifactFiles = incoming
  } else {
    diskFiles = { ...incoming }
    if (html) diskFiles['index.html'] = diskFiles['index.html'] || html
    artifactFiles = diskFiles
  }

  const written = await writeDraftPreview({
    workspaceRef: session.projectRef,
    title: input.runtime.spec?.businessName || session.projectName || 'Preview',
    files: diskFiles,
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
    artifactHtml: html,
    artifactFiles,
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
      html,
      files: viteSource
        ? { ...(job.files || {}), ...incoming }
        : { ...(job.files || {}), ...diskFiles },
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
