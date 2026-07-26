import { useState, useEffect, useCallback } from 'preact/hooks'
import {
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  Group,
  Ungroup,
  Pen,
  QrCode,
  ChartColumn,
  Layers2,
  Share2,
  MessageSquare,
  FolderPlus,
  History,
  Sparkles,
} from 'lucide-preact'
import * as fabric from 'fabric'
import { useEditor } from '../context'
import { showToast } from './toast'
import {
  alignObjects,
  distributeObjects,
  groupSelection,
  ungroupSelection,
  applyShadow,
  magicResizeCanvasJson,
} from '../utils/canvas-tools'
import { ELEMENTS, addQrCode, addBarChart, addPieChart } from '../utils/elements'
import { parseBulkRows, buildBulkVariants } from '../utils/bulk-create'
import { api } from '../api'
import { CANVAS_SIZES } from '../context'

export function ParityToolsPanel() {
  const {
    canvas,
    canvasWidth,
    canvasHeight,
    setCanvasSize,
    loadCanvasDocument,
    getCanvasJSON,
    addShape,
    selectedObject,
    activeDesign,
    scheduleSave,
  } = useEditor()

  const [drawMode, setDrawMode] = useState(false)
  const [qrText, setQrText] = useState('https://indobase.in')
  const [bulkCsv, setBulkCsv] = useState(
    'product_name,price\nPaneer Tikka,₹220\nMasala Chai,₹80'
  )
  const [busy, setBusy] = useState(false)
  const [comments, setComments] = useState<
    Array<{ id: string; author_email: string; body: string; created_at: string }>
  >([])
  const [commentBody, setCommentBody] = useState('')
  const [versions, setVersions] = useState<
    Array<{ id: string; label: string; created_at: string }>
  >([])
  const [shareUrl, setShareUrl] = useState('')

  const refreshMeta = useCallback(async () => {
    if (!activeDesign) return
    try {
      const [c, v] = await Promise.all([
        api<typeof comments>('GET', `/api/designs/${activeDesign.id}/comments`),
        api<typeof versions>('GET', `/api/designs/${activeDesign.id}/versions`),
      ])
      setComments(c)
      setVersions(v)
    } catch {
      /* ignore */
    }
  }, [activeDesign])

  useEffect(() => {
    void refreshMeta()
  }, [refreshMeta])

  // Drawing mode
  useEffect(() => {
    if (!canvas) return
    if (!drawMode) {
      canvas.isDrawingMode = false
      return
    }
    canvas.isDrawingMode = true
    const brush = new fabric.PencilBrush(canvas)
    brush.width = 4
    brush.color = '#111827'
    canvas.freeDrawingBrush = brush
    return () => {
      canvas.isDrawingMode = false
    }
  }, [canvas, drawMode])

  const needCanvas = () => {
    if (!canvas) {
      showToast('Open a design page first', 'error')
      return false
    }
    return true
  }

  return (
    <div class="flex flex-col gap-4 text-[11px]">
      {/* Align / group */}
      <section>
        <p class="text-zinc-500 uppercase tracking-wide font-semibold mb-2 m-0">Arrange</p>
        <div class="grid grid-cols-3 gap-1 mb-2">
          {(
            [
              ['left', 'L'],
              ['center', 'C'],
              ['right', 'R'],
              ['top', 'T'],
              ['middle', 'M'],
              ['bottom', 'B'],
            ] as const
          ).map(([edge, label]) => (
            <button
              key={edge}
              class="px-1 py-1.5 rounded border border-zinc-200 bg-white cursor-pointer hover:border-accent"
              onClick={() => {
                if (!needCanvas()) return
                alignObjects(canvas!, edge, canvasWidth, canvasHeight)
                scheduleSave?.()
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div class="flex gap-1 mb-2">
          <button
            class="flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded border border-zinc-200 bg-white cursor-pointer"
            onClick={() => {
              if (!needCanvas()) return
              distributeObjects(canvas!, 'horizontal')
            }}
            title="Distribute horizontal"
          >
            <AlignHorizontalDistributeCenter size={12} />
          </button>
          <button
            class="flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded border border-zinc-200 bg-white cursor-pointer"
            onClick={() => {
              if (!needCanvas()) return
              distributeObjects(canvas!, 'vertical')
            }}
            title="Distribute vertical"
          >
            <AlignVerticalDistributeCenter size={12} />
          </button>
          <button
            class="flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded border border-zinc-200 bg-white cursor-pointer"
            onClick={() => void groupSelection(canvas!).then(() => scheduleSave?.())}
            title="Group"
          >
            <Group size={12} />
          </button>
          <button
            class="flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded border border-zinc-200 bg-white cursor-pointer"
            onClick={() => void ungroupSelection(canvas!).then(() => scheduleSave?.())}
            title="Ungroup"
          >
            <Ungroup size={12} />
          </button>
        </div>
      </section>

      {/* Effects */}
      <section>
        <p class="text-zinc-500 uppercase tracking-wide font-semibold mb-2 m-0">Effects</p>
        <div class="flex gap-1">
          <button
            class="flex-1 py-1.5 rounded border border-zinc-200 bg-white cursor-pointer"
            onClick={() => {
              if (!selectedObject) return showToast('Select an object', 'error')
              applyShadow(selectedObject, { blur: 16, offsetX: 6, offsetY: 6 })
              canvas?.requestRenderAll()
              scheduleSave?.()
            }}
          >
            Shadow
          </button>
          <button
            class="flex-1 py-1.5 rounded border border-zinc-200 bg-white cursor-pointer"
            onClick={() => {
              if (!selectedObject) return showToast('Select an object', 'error')
              applyShadow(selectedObject, null)
              canvas?.requestRenderAll()
            }}
          >
            Clear
          </button>
        </div>
        {selectedObject instanceof fabric.FabricImage && (
          <div class="mt-2 flex flex-col gap-1">
            <label class="text-zinc-400">Brightness</label>
            <input
              type="range"
              min="-0.4"
              max="0.4"
              step="0.05"
              class="w-full accent-accent"
              onChange={(e) => {
                const v = parseFloat((e.target as HTMLInputElement).value)
                const img = selectedObject as fabric.FabricImage
                img.filters = [new fabric.filters.Brightness({ brightness: v })]
                img.applyFilters()
                canvas?.requestRenderAll()
              }}
            />
            <label class="text-zinc-400">Contrast</label>
            <input
              type="range"
              min="-0.4"
              max="0.4"
              step="0.05"
              class="w-full accent-accent"
              onChange={(e) => {
                const v = parseFloat((e.target as HTMLInputElement).value)
                const img = selectedObject as fabric.FabricImage
                img.filters = [new fabric.filters.Contrast({ contrast: v })]
                img.applyFilters()
                canvas?.requestRenderAll()
              }}
            />
            <label class="text-zinc-400">Saturation</label>
            <input
              type="range"
              min="-1"
              max="1"
              step="0.05"
              class="w-full accent-accent"
              onChange={(e) => {
                const v = parseFloat((e.target as HTMLInputElement).value)
                const img = selectedObject as fabric.FabricImage
                img.filters = [new fabric.filters.Saturation({ saturation: v })]
                img.applyFilters()
                canvas?.requestRenderAll()
              }}
            />
            <p class="text-[10px] text-zinc-400 m-0">
              Background remove is Phase 3 (no RemBG key on Design).
            </p>
          </div>
        )}
      </section>

      {/* Draw */}
      <section>
        <p class="text-zinc-500 uppercase tracking-wide font-semibold mb-2 m-0">Draw</p>
        <button
          class={`w-full inline-flex items-center justify-center gap-1.5 py-2 rounded border cursor-pointer ${
            drawMode ? 'bg-accent text-white border-accent' : 'bg-white border-zinc-200'
          }`}
          onClick={() => setDrawMode((v) => !v)}
        >
          <Pen size={12} />
          {drawMode ? 'Drawing on — click to stop' : 'Freehand pen'}
        </button>
      </section>

      {/* Elements */}
      <section>
        <p class="text-zinc-500 uppercase tracking-wide font-semibold mb-2 m-0">Elements</p>
        <div class="grid grid-cols-2 gap-1">
          {ELEMENTS.map((el) => (
            <button
              key={el.id}
              class="py-1.5 rounded border border-zinc-200 bg-white cursor-pointer text-[10px]"
              onClick={() => {
                if (!needCanvas()) return
                el.add(canvas!, canvasWidth / 2, canvasHeight / 2)
                scheduleSave?.()
              }}
            >
              {el.label}
            </button>
          ))}
          {(['rect', 'circle', 'triangle', 'line'] as const).map((t) => (
            <button
              key={t}
              class="py-1.5 rounded border border-zinc-200 bg-white cursor-pointer text-[10px] capitalize"
              onClick={() => addShape(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      {/* QR + charts */}
      <section>
        <p class="text-zinc-500 uppercase tracking-wide font-semibold mb-2 m-0">QR & charts</p>
        <input
          class="w-full mb-1 bg-zinc-50 border border-zinc-200 rounded px-2 py-1"
          value={qrText}
          onInput={(e) => setQrText((e.target as HTMLInputElement).value)}
        />
        <button
          class="w-full mb-2 inline-flex items-center justify-center gap-1 py-1.5 rounded border border-zinc-200 bg-white cursor-pointer"
          onClick={() => {
            if (!needCanvas()) return
            void addQrCode(canvas!, qrText, canvasWidth / 2, canvasHeight / 2).then(() =>
              showToast('QR added', 'success')
            )
          }}
        >
          <QrCode size={12} /> Add QR
        </button>
        <div class="flex gap-1">
          <button
            class="flex-1 py-1.5 rounded border border-zinc-200 bg-white cursor-pointer"
            onClick={() => {
              if (!needCanvas()) return
              addBarChart(canvas!, [40, 70, 55, 90], ['Q1', 'Q2', 'Q3', 'Q4'], 80, 120)
            }}
          >
            <ChartColumn size={12} class="inline mr-1" />
            Bars
          </button>
          <button
            class="flex-1 py-1.5 rounded border border-zinc-200 bg-white cursor-pointer"
            onClick={() => {
              if (!needCanvas()) return
              addPieChart(canvas!, [30, 25, 20, 25], canvasWidth / 2, canvasHeight / 2)
            }}
          >
            Pie
          </button>
        </div>
      </section>

      {/* Magic resize */}
      <section>
        <p class="text-zinc-500 uppercase tracking-wide font-semibold mb-2 m-0">Magic resize</p>
        <select
          class="w-full bg-zinc-50 border border-zinc-200 rounded px-2 py-1.5"
          onChange={(e) => {
            const label = (e.target as HTMLSelectElement).value
            const size = CANVAS_SIZES.find((s) => s.label === label)
            if (!size || !needCanvas()) return
            const resized = magicResizeCanvasJson(
              getCanvasJSON(),
              canvasWidth,
              canvasHeight,
              size.width,
              size.height
            )
            setCanvasSize(size.width, size.height)
            loadCanvasDocument(resized)
            showToast(`Resized to ${size.label}`, 'success')
            scheduleSave?.()
          }}
        >
          <option value="">Resize to…</option>
          {CANVAS_SIZES.map((s) => (
            <option key={s.label} value={s.label}>
              {s.label} ({s.width}×{s.height})
            </option>
          ))}
        </select>
      </section>

      {/* Bulk create */}
      <section>
        <p class="text-zinc-500 uppercase tracking-wide font-semibold mb-2 m-0">Bulk create</p>
        <textarea
          class="w-full min-h-[70px] bg-zinc-50 border border-zinc-200 rounded px-2 py-1 font-mono text-[10px]"
          value={bulkCsv}
          onInput={(e) => setBulkCsv((e.target as HTMLTextAreaElement).value)}
        />
        <button
          class="w-full mt-1 inline-flex items-center justify-center gap-1 py-1.5 rounded bg-accent text-white border-none cursor-pointer disabled:opacity-50"
          disabled={busy}
          onClick={async () => {
            try {
              setBusy(true)
              const rows = parseBulkRows(bulkCsv)
              if (!rows.length) {
                showToast('No rows to create', 'error')
                return
              }
              const variants = buildBulkVariants(getCanvasJSON(), rows, 20)
              for (const v of variants) {
                await api('POST', '/api/designs', {
                  name: v.name,
                  canvas_json: JSON.parse(v.canvas_json),
                  width: canvasWidth,
                  height: canvasHeight,
                })
              }
              showToast(`Created ${variants.length} variants`, 'success')
            } catch (e) {
              showToast(e instanceof Error ? e.message : 'Bulk create failed', 'error')
            } finally {
              setBusy(false)
            }
          }}
        >
          <Layers2 size={12} /> Create variants
        </button>
      </section>

      {/* Versions */}
      <section>
        <p class="text-zinc-500 uppercase tracking-wide font-semibold mb-2 m-0">Versions</p>
        <button
          class="w-full mb-2 inline-flex items-center justify-center gap-1 py-1.5 rounded border border-zinc-200 bg-white cursor-pointer"
          onClick={async () => {
            if (!activeDesign) return
            await api('POST', `/api/designs/${activeDesign.id}/versions`, {
              label: `Snapshot ${new Date().toLocaleString()}`,
              canvas_json: JSON.parse(getCanvasJSON()),
              width: canvasWidth,
              height: canvasHeight,
            })
            showToast('Snapshot saved', 'success')
            void refreshMeta()
          }}
        >
          <History size={12} /> Save snapshot
        </button>
        <div class="flex flex-col gap-1 max-h-28 overflow-y-auto">
          {versions.map((v) => (
            <button
              key={v.id}
              class="text-left px-2 py-1 rounded border border-zinc-100 bg-zinc-50 cursor-pointer hover:border-accent"
              onClick={async () => {
                if (!activeDesign) return
                const r = await api<{ canvas_json: unknown; width: number; height: number }>(
                  'POST',
                  `/api/designs/${activeDesign.id}/versions/${v.id}/restore`,
                  {}
                )
                setCanvasSize(r.width, r.height)
                loadCanvasDocument(JSON.stringify(r.canvas_json))
                showToast('Version restored', 'success')
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      </section>

      {/* Share + comments */}
      <section>
        <p class="text-zinc-500 uppercase tracking-wide font-semibold mb-2 m-0">Share & comments</p>
        <button
          class="w-full mb-1 inline-flex items-center justify-center gap-1 py-1.5 rounded border border-zinc-200 bg-white cursor-pointer"
          onClick={async () => {
            if (!activeDesign) return
            const r = await api<{ url: string; token: string }>(
              'POST',
              `/api/designs/${activeDesign.id}/share`,
              { can_edit: false }
            )
            const full = `${location.origin}${r.url}`
            setShareUrl(full)
            try {
              await navigator.clipboard.writeText(full)
              showToast('Share link copied', 'success')
            } catch {
              showToast(full, 'info')
            }
          }}
        >
          <Share2 size={12} /> Copy share link
        </button>
        {shareUrl && <p class="text-[10px] text-zinc-400 break-all m-0 mb-2">{shareUrl}</p>}
        <textarea
          class="w-full min-h-[50px] bg-zinc-50 border border-zinc-200 rounded px-2 py-1"
          placeholder="Add a comment…"
          value={commentBody}
          onInput={(e) => setCommentBody((e.target as HTMLTextAreaElement).value)}
        />
        <button
          class="w-full mt-1 inline-flex items-center justify-center gap-1 py-1.5 rounded border border-zinc-200 bg-white cursor-pointer"
          onClick={async () => {
            if (!activeDesign || !commentBody.trim()) return
            await api('POST', `/api/designs/${activeDesign.id}/comments`, { body: commentBody })
            setCommentBody('')
            showToast('Comment added', 'success')
            void refreshMeta()
          }}
        >
          <MessageSquare size={12} /> Comment
        </button>
        <div class="mt-2 flex flex-col gap-1 max-h-24 overflow-y-auto">
          {comments.map((c) => (
            <div key={c.id} class="px-2 py-1 rounded bg-zinc-50 border border-zinc-100">
              <p class="m-0 text-[10px] text-zinc-400">{c.author_email}</p>
              <p class="m-0 text-zinc-700">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Folders */}
      <section>
        <p class="text-zinc-500 uppercase tracking-wide font-semibold mb-2 m-0">Folders</p>
        <button
          class="w-full inline-flex items-center justify-center gap-1 py-1.5 rounded border border-zinc-200 bg-white cursor-pointer"
          onClick={async () => {
            const name = prompt('Folder name')
            if (!name) return
            await api('POST', '/api/folders', { name })
            showToast('Folder created', 'success')
          }}
        >
          <FolderPlus size={12} /> New folder
        </button>
      </section>

      {/* Suite handoffs */}
      <section>
        <p class="text-zinc-500 uppercase tracking-wide font-semibold mb-2 m-0">Suite handoffs</p>
        <p class="text-[10px] text-zinc-400 m-0 mb-2">
          Canva Video/Social/Email categories → Indobase products (not rebuilt here).
        </p>
        <div class="flex flex-col gap-1">
          <a
            class="block text-center py-1.5 rounded border border-zinc-200 bg-white text-zinc-700 no-underline hover:border-accent"
            href="https://studio.indobase.in"
            target="_blank"
            rel="noreferrer"
            onClick={(e) => {
              e.preventDefault()
              // Export PNG then open Studio Marketing (Video/Social live there).
              try {
                // Parent toolbar export is preferred; here we deep-link Studio.
                const studio = (window as unknown as { __STUDIO_URL?: string }).__STUDIO_URL
                location.href = studio || 'https://studio.indobase.in'
              } catch {
                location.href = 'https://studio.indobase.in'
              }
            }}
          >
            <Sparkles size={12} class="inline mr-1" />
            Open Studio Marketing
          </a>
          <p class="text-[10px] text-zinc-400 m-0">
            Export PNG/JPG from the toolbar, then use <strong>Open Video</strong> /{' '}
            <strong>Open Social</strong> / Email from the Marketing hub with your asset.
          </p>
        </div>
      </section>
    </div>
  )
}
