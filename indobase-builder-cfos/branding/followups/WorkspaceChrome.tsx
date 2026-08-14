/**
 * Chat + live preview workspace. Preview is a participant in the conversation.
 * Mount once from ChatInterface; polls /api/session so the iframe tracks the job.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { BusinessControlCenter } from './BusinessControlCenter'
import styles from './WorkspaceChrome.module.css'
import {
  type PreviewEditIntent,
  type PreviewEditTarget,
  type WorkspaceScreen,
  type AuthoritativeProject,
  type WorkspaceSnapshot,
  type WorkspaceViewModel,
  formatPreviewEditMessage,
  previewEditSuggestions,
  previewSelectToEditMessage,
  workspaceViewModel,
} from './ux-conductor'

type JourneyWindow = {
  guest?: boolean
  live_url?: string | null
  flags?: {
    is_guest?: boolean
    is_backend_ready?: boolean
    is_live?: boolean
    is_payments_ready?: boolean
  }
}

type JobWindow = {
  jobId?: string
  status?: string
  appType?: string
  url?: string | null
  updatedAt?: string
  next_pending?: string | null
  stages?: Array<{ id: string; status: string; title?: string }>
  failures?: Array<{ code?: string; message?: string; repairable?: boolean }>
  operator_failure?: { title?: string; body?: string; code?: string; repairable?: boolean } | null
  contract?: { capabilities?: Array<{ id?: string }> }
}

type LaunchWindow = {
  draft_preview_path?: string | null
}

function readUxLabel(): string | null {
  try {
    const ux = (window as unknown as { __INDOBASE_UX__?: { stream?: { label?: string }; lifecycle?: { current?: string } } })
      .__INDOBASE_UX__
    return ux?.stream?.label || ux?.lifecycle?.current || null
  } catch {
    return null
  }
}

function readSnapshot(): WorkspaceSnapshot {
  try {
    const w = window as unknown as {
      __INDOBASE_JOURNEY__?: JourneyWindow | null
      __INDOBASE_PRODUCTION_JOB__?: JobWindow | null
      __INDOBASE_LAUNCH__?: LaunchWindow | null
      __INDOBASE_GUEST__?: boolean
      __INDOBASE_PREVIEW_URL__?: string | null
      __INDOBASE__?: { PROJECT_REF?: string } | null
      __INDOBASE_DISPLAY_NAME__?: string | null
      __INDOBASE_PROJECT__?: AuthoritativeProject | null
      __INDOBASE_PREVIEW_STATUS__?: 'absent' | 'building' | 'ready' | 'failed' | null
    }
    const journey = w.__INDOBASE_JOURNEY__
    const job = w.__INDOBASE_PRODUCTION_JOB__
    const launch = w.__INDOBASE_LAUNCH__
    const lastFail = job?.failures?.[job.failures.length - 1]
    const authority = w.__INDOBASE_PROJECT__?.state ? w.__INDOBASE_PROJECT__ : null
    const liveUrl =
      (authority?.state === 'live' && (journey?.live_url || job?.url || w.__INDOBASE_PREVIEW_URL__ || null)) ||
      (job?.status === 'live' && job.url) ||
      (authority?.state === 'live' ? journey?.live_url || null : null) ||
      null
    const previewReady = w.__INDOBASE_PREVIEW_STATUS__ === 'ready' || Boolean(liveUrl)
    const publishedOrJobPreview =
      (previewReady && (w.__INDOBASE_PREVIEW_URL__ || liveUrl)) ||
      liveUrl ||
      (typeof job?.url === 'string' && job.url.startsWith('http') ? job.url : null) ||
      launch?.draft_preview_path ||
      w.__INDOBASE_PREVIEW_URL__ ||
      null
    return {
      guest: Boolean(w.__INDOBASE_GUEST__ || journey?.guest || journey?.flags?.is_guest),
      liveUrl,
      previewUrl: publishedOrJobPreview,
      previewReady,
      previewStatus: w.__INDOBASE_PREVIEW_STATUS__ || (previewReady ? 'ready' : undefined),
      jobStatus: job?.status || null,
      jobStage: job?.next_pending || null,
      appType: job?.appType || null,
      failureCode: job?.operator_failure?.code || lastFail?.code || null,
      failureMessage: job?.operator_failure?.body || lastFail?.message || null,
      repairable: job?.operator_failure?.repairable ?? lastFail?.repairable,
      stages: job?.stages,
      displayName: w.__INDOBASE_DISPLAY_NAME__ || null,
      authority,
      ...(authority
        ? {}
        : {
            live: Boolean(job?.status === 'live' || journey?.flags?.is_live || liveUrl),
            backendReady: Boolean(journey?.flags?.is_backend_ready),
            paymentsReady: Boolean(journey?.flags?.is_payments_ready),
            contractCapabilityIds: job?.contract?.capabilities?.map((c) => c.id).filter(Boolean) as
              | string[]
              | undefined,
          }),
    }
  } catch {
    return {}
  }
}

const WORKSPACE_ATTR = 'data-indobase-workspace-chrome'

export const WorkspaceChrome = memo(function WorkspaceChrome({
  onPick,
  disabled,
}: {
  onPick: (message: string) => void
  disabled?: boolean
}) {
  const [snap, setSnap] = useState<WorkspaceSnapshot>(() =>
    typeof window === 'undefined' ? {} : readSnapshot(),
  )
  const [previewOpen, setPreviewOpen] = useState(false)
  const [frameKey, setFrameKey] = useState(0)
  const [previewBoot, setPreviewBoot] = useState<'waiting' | 'ready' | 'failed'>('waiting')
  const [pane, setPane] = useState<'preview' | 'control'>('preview')
  const [selection, setSelection] = useState<{
    target: PreviewEditTarget
    rect: { top: number; left: number; width: number; height: number }
  } | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const view = useMemo(() => workspaceViewModel(snap), [snap])
  const showChromeAside = false

  const refresh = useCallback(() => {
    setSnap(readSnapshot())
  }, [])

  useEffect(() => {
    refresh()
    const onCtx = () => refresh()
    window.addEventListener('indobase:context', onCtx)
    window.addEventListener('indobase:runtime-updated', onCtx)
    return () => {
      window.removeEventListener('indobase:context', onCtx)
      window.removeEventListener('indobase:runtime-updated', onCtx)
    }
  }, [refresh])

  useEffect(() => {
    let cancelled = false
    const pull = async () => {
      try {
        const s = await fetch('/api/session', { credentials: 'same-origin' }).then((r) => r.json())
        if (cancelled) return
        const w = window as unknown as Record<string, unknown>
        w.__INDOBASE_JOURNEY__ = s.journey || null
        w.__INDOBASE_PRODUCTION_JOB__ = s.production_job || null
        w.__INDOBASE_LAUNCH__ = s.launch || null
        w.__INDOBASE_GUEST__ = !!s.guest
        w.__INDOBASE_SESSION_STAGE__ = s.stage || (s.guest ? 'guest' : 'member')
        w.__INDOBASE_PREVIEW_STATUS__ = (s.preview && s.preview.status) || null
        w.__INDOBASE_PREVIEW_URL__ =
          (s.preview && s.preview.status === 'ready' && s.preview.url) ||
          (s.project && s.project.state === 'live' && s.journey && s.journey.live_url) ||
          (s.journey && s.journey.live_url) ||
          (s.production_job && s.production_job.status === 'live' && s.production_job.url) ||
          (s.launch && s.launch.draft_preview_path) ||
          null
        w.__INDOBASE_DISPLAY_NAME__ = s.display_name || null
        w.__INDOBASE_PROJECT_REF__ = s.project_ref || null
        if (s.project) w.__INDOBASE_PROJECT__ = s.project
        if (s.runtime) w.__INDOBASE_RUNTIME__ = s.runtime
        if (s.ux) w.__INDOBASE_UX__ = s.ux
        if (typeof s.agent_hint === 'string' && s.agent_hint.trim()) {
          w.__INDOBASE_AGENT_HINT__ = s.agent_hint
        }
        if (w.__INDOBASE__ && typeof w.__INDOBASE__ === 'object') {
          ;(w.__INDOBASE__ as { guest?: boolean }).guest = !!s.guest
        } else {
          w.__INDOBASE__ = { guest: !!s.guest, PROJECT_REF: s.project_ref || null }
        }
        window.dispatchEvent(new CustomEvent('indobase:context'))
      } catch {
        /* ignore */
      }
    }
    void pull()
    const onRuntime = () => void pull()
    window.addEventListener('indobase:runtime-updated', onRuntime)
    const hot = view.state === 'building' || view.state === 'publishing' || view.state === 'empty'
    const id = window.setInterval(() => void pull(), hot ? 2500 : 10000)
    return () => {
      cancelled = true
      window.clearInterval(id)
      window.removeEventListener('indobase:runtime-updated', onRuntime)
    }
  }, [view.state])

  useEffect(() => {
    setFrameKey((n) => n + 1)
    setSelection(null)
    setPreviewBoot('waiting')
  }, [view.previewUrl, view.state])

  useEffect(() => {
    if (view.showControlCenter) setPane('control')
  }, [view.showControlCenter])

  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

  const sendPreviewEdit = (intent: PreviewEditIntent, request: string) => {
    if (!selection) return
    onPick(
      formatPreviewEditMessage({
        target: selection.target,
        intent,
        request,
      }),
    )
    setSelection(null)
    setEditDraft('')
  }

  useEffect(() => {
    const allowed = new Set(
      [window.location.origin, 'https://builder.indobase.in', 'https://builder.indobase.fun'].filter(Boolean),
    )
    const onMsg = (ev: MessageEvent) => {
      const data = ev.data as {
        type?: string
        projectRef?: string
        artifactHash?: string
        runtimeVersion?: string
        target?: PreviewEditTarget
        rect?: { top: number; left: number; width: number; height: number }
      }
      if (!data || typeof data !== 'object') return
      if (data.type === 'INDOBASE_PREVIEW_READY' || data.type === 'INDOBASE_PREVIEW_ERROR') {
        if (!allowed.has(ev.origin)) return
        const expectedRef = readProjectRef()
        if (expectedRef && data.projectRef && data.projectRef !== expectedRef) return
        if (data.runtimeVersion && data.runtimeVersion !== 'v1') return
        setPreviewBoot(data.type === 'INDOBASE_PREVIEW_READY' ? 'ready' : 'failed')
        return
      }
      if (!data || data.type !== 'indobase:preview-select' || !data.target) return
      if (!allowed.has(ev.origin) && ev.origin !== window.location.origin) return
      setPane('preview')
      setSelection({
        target: data.target,
        rect: data.rect || { top: 48, left: 24, width: 200, height: 80 },
      })
      setEditDraft('')
      onPickRef.current(previewSelectToEditMessage(data.target))
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  const persistScreen = useCallback((screen: WorkspaceScreen) => {
    try {
      ;(window as unknown as { __INDOBASE_SCREEN__?: WorkspaceScreen }).__INDOBASE_SCREEN__ = screen
      void fetch('/api/os/ux/screen', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(screen),
      })
    } catch {
      /* ignore */
    }
  }, [])

  const previewSrc = withEditQuery(null)

  useEffect(() => {
    if (previewBoot !== 'waiting' || !previewSrc) return
    const t = window.setTimeout(() => setPreviewBoot((b) => (b === 'waiting' ? 'failed' : b)), 10_000)
    return () => window.clearTimeout(t)
  }, [previewBoot, previewSrc, frameKey])

  useEffect(() => {
    const html = document.documentElement
    if (!showChromeAside) {
      html.classList.remove('indobase-workspace-split', 'indobase-workspace-preview-open')
      html.removeAttribute(WORKSPACE_ATTR)
      return
    }
    html.classList.add('indobase-workspace-split')
    html.setAttribute(WORKSPACE_ATTR, view.state)
    if (previewOpen) html.classList.add('indobase-workspace-preview-open')
    else html.classList.remove('indobase-workspace-preview-open')
    const styleId = 'indobase-workspace-split-css'
    if (!document.getElementById(styleId)) {
      const el = document.createElement('style')
      el.id = styleId
      el.textContent =
        '@media (min-width: 960px){html.indobase-workspace-split body{margin-right:min(52vw,820px)!important;}}'
      document.head.appendChild(el)
    }
    return () => {
      html.classList.remove('indobase-workspace-split', 'indobase-workspace-preview-open')
      html.removeAttribute(WORKSPACE_ATTR)
    }
  }, [previewOpen, view.state, showChromeAside])

  if (typeof document === 'undefined') return null

  const showIframe = false
  const overlay = showChromeAside ? overlayFor(view) : null

  if (!showChromeAside) return null

  return createPortal(
    <div className={styles.portal}>
      <header className={styles.bar}>
        <div className={styles.brand}>Indobase</div>
        <div className={styles.actions}>
          {view.state === 'live' ? <span className={styles.liveBadge}>LIVE</span> : null}
          {readUxLabel() && view.state !== 'live' ? (
            <span className={styles.previewBadge}>{readUxLabel()}</span>
          ) : null}
          {showChromeAside ? (
          <button type="button" className={styles.toggle} onClick={() => setPreviewOpen((v) => !v)}>
            {previewOpen ? 'Hide panel' : 'Manage'}
          </button>
          ) : null}
          {view.actions[0] ? (
            <button
              type="button"
              className={styles.action}
              disabled={disabled}
              onClick={() => onPick(view.actions[0].message)}
            >
              {view.actions[0].label}
            </button>
          ) : null}
        </div>
      </header>
      <aside
        className={[styles.preview, previewOpen ? styles.previewOpen : ''].filter(Boolean).join(' ')}
        aria-label="Live preview"
      >
        <div className={styles.previewHead}>
          <div className={styles.previewTitle}>
            {view.state === 'live' ? (
              <span className={styles.liveBadge}>LIVE</span>
            ) : (
              <span className={styles.previewBadge}>Preview</span>
            )}
            <span>{view.previewHint}</span>
          </div>
          <div className={styles.actions}>
            {view.showControlCenter ? (
              <button
                type="button"
                className={`${styles.action} ${styles.actionSecondary}`}
                onClick={() => {
                  if (view.liveUrl) window.open(view.liveUrl, '_blank', 'noopener,noreferrer')
                }}
              >
                Open site
              </button>
            ) : null}
            {view.actions.slice(0, 2).map((a) => (
              <button
                key={a.label}
                type="button"
                className={
                  a === view.actions[0]
                    ? styles.action
                    : `${styles.action} ${styles.actionSecondary}`
                }
                disabled={disabled}
                onClick={() => onPick(a.message)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.frameWrap}>
          {showControl ? (
            <BusinessControlCenter
              brand={snap.displayName || view.noun}
              displayName={snap.displayName}
              liveUrl={view.liveUrl}
              nav={view.nav}
              capabilities={view.capabilities}
              projectRef={readProjectRef()}
              disabled={disabled}
              onPick={onPick}
              onOpenStorefront={() => {
                if (view.liveUrl) window.open(view.liveUrl, '_blank', 'noopener,noreferrer')
              }}
              onScreen={persistScreen}
            />
          ) : showIframe ? (
            <>
              <iframe
                key={`${previewSrc}:${frameKey}`}
                className={styles.frame}
                title="Application preview"
                src={previewSrc || undefined}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              />
              {previewBoot !== 'ready' ? (
                <div className={styles.empty}>
                  <h2>{previewBoot === 'failed' ? 'Preview unavailable' : 'Checking preview'}</h2>
                  <p>
                    {previewBoot === 'failed'
                      ? 'The preview did not confirm it booted. I will not treat a blank frame as ready.'
                      : 'Waiting for the application to report it is ready.'}
                  </p>
                  {previewBoot === 'failed' ? (
                    <button
                      type="button"
                      className={styles.action}
                      onClick={() => {
                        setPreviewBoot('waiting')
                        setFrameKey((n) => n + 1)
                      }}
                    >
                      Retry
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : overlay ? null : (
            <div className={styles.empty}>
              <h2>{view.state === 'empty' ? 'Live preview' : view.headline}</h2>
              <p>{view.state === 'empty' ? view.previewHint : view.body}</p>
            </div>
          )}
          {selection && !showControl ? (
            <div
              className={styles.popover}
              style={{
                top: Math.min(Math.max(8, selection.rect.top + selection.rect.height + 8), 280),
                left: Math.min(Math.max(8, selection.rect.left), 220),
              }}
            >
              <div className={styles.popoverKicker}>✦ {selection.target.label || selection.target.component}</div>
              <h3>What would you like to change?</h3>
              <div className={styles.popoverChips}>
                {previewEditSuggestions(selection.target).map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      sendPreviewEdit(
                        a.label.includes('image')
                          ? 'change_image'
                          : a.label.includes('premium')
                            ? 'make_premium'
                            : 'modify_copy',
                        a.message,
                      )
                    }
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <div className={styles.popoverTools}>
                <button type="button" disabled={disabled} onClick={() => sendPreviewEdit('duplicate', `Duplicate the ${selection.target.label || 'section'}.`)}>
                  Duplicate
                </button>
                <button type="button" disabled={disabled} onClick={() => sendPreviewEdit('hide', `Hide the ${selection.target.label || 'section'}.`)}>
                  Hide
                </button>
                <button type="button" disabled={disabled} onClick={() => sendPreviewEdit('move', `Move the ${selection.target.label || 'section'} down.`)}>
                  Move
                </button>
                <button type="button" disabled={disabled} onClick={() => sendPreviewEdit('delete', `Delete the ${selection.target.label || 'section'}.`)}>
                  Delete
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (editDraft.trim()) sendPreviewEdit('edit', editDraft.trim())
                }}
              >
                <input
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  placeholder="Or describe a change…"
                  disabled={disabled}
                />
                <button type="submit" disabled={disabled || !editDraft.trim()}>
                  Send
                </button>
              </form>
            </div>
          ) : null}
          {overlay ? (
            <div className={styles.overlay} data-kind={view.state === 'needs_attention' ? 'attention' : 'progress'}>
              <h2>{overlay.title}</h2>
              <p>{overlay.body}</p>
              {view.liveUrl && view.state === 'live' ? (
                <div className={styles.liveUrl}>{hostOf(view.liveUrl)}</div>
              ) : null}
              {overlay.actions.length > 0 ? (
                <div className={styles.overlayActions}>
                  {overlay.actions.map((a) => (
                    <button
                      key={a.label}
                      type="button"
                      className={
                        a === overlay.actions[0]
                          ? styles.action
                          : `${styles.action} ${styles.actionSecondary}`
                      }
                      disabled={disabled}
                      onClick={() => onPick(a.message)}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>
    </div>,
    document.body,
  )
})

function hostedWebsiteKind(kind: string | null | undefined): boolean {
  const k = (kind || '').toLowerCase()
  return (
    k === 'store' ||
    k === 'ecommerce' ||
    k === 'ordering' ||
    k === 'saas' ||
    k === 'app' ||
    k === 'landing' ||
    k === 'website' ||
    k === 'booking' ||
    k === 'agency'
  )
}

/** Sites publish to /live and domains — do not iframe them over Gadget. Docs / Insta / Design keep native preview. */
function useGadgetPreviewPane(view: WorkspaceViewModel, snap: WorkspaceSnapshot): boolean {
  if (view.state === 'empty') return true
  if (view.showControlCenter) return false
  if (hostedWebsiteKind(view.kind) || hostedWebsiteKind(snap.appType)) return false
  return true
}

function overlayFor(view: WorkspaceViewModel): {
  title: string
  body: string
  actions: WorkspaceViewModel['actions']
} | null {
  if (view.state === 'empty' && !view.previewUrl) return null
  if (view.state === 'building' && !view.previewUrl) {
    return { title: view.headline, body: view.body, actions: [] }
  }
  if (view.state === 'publishing' && !view.previewUrl) {
    return { title: view.headline, body: view.body, actions: [] }
  }
  if (view.state === 'needs_attention') {
    return { title: view.headline, body: view.body, actions: view.actions }
  }
  return null
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url.replace(/^https?:\/\//, '')
  }
}

function embedPreviewSrc(
  projectRef: string | null,
  previewUrl: string | null,
  liveUrl: string | null,
): string | null {
  if (projectRef) return `/live/${projectRef}/`
  const candidate = previewUrl || ''
  if (candidate.startsWith('/live/')) return candidate
  try {
    if (candidate) {
      const parsed = new URL(candidate, window.location.origin)
      if (parsed.pathname.startsWith('/live/')) return `${parsed.pathname}${parsed.search}`
    }
  } catch {
    /* ignore */
  }
  if (liveUrl && liveUrl.startsWith('/live/')) return liveUrl
  return null
}

function withEditQuery(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url, window.location.origin)
    u.searchParams.set('ib_edit', '1')
    return u.toString()
  } catch {
    return url.includes('?') ? `${url}&ib_edit=1` : `${url}?ib_edit=1`
  }
}

function readProjectRef(): string | null {
  try {
    const w = window as unknown as { __INDOBASE__?: { PROJECT_REF?: string }; __INDOBASE_PRODUCTION_JOB__?: { projectRef?: string } }
    const extra = window as unknown as { __INDOBASE_PROJECT_REF__?: string }
    return extra.__INDOBASE_PROJECT_REF__ || w.__INDOBASE__?.PROJECT_REF || w.__INDOBASE_PRODUCTION_JOB__?.projectRef || null
  } catch {
    return null
  }
}
