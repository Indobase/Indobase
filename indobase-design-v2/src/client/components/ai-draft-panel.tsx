import { useState, useEffect } from 'preact/hooks'
import { Sparkles } from 'lucide-preact'
import { api } from '../api'
import { useEditor } from '../context'
import { showToast } from './toast'

export const AI_PROMPT_STORAGE_KEY = 'indobase-design-ai-prompt'

type DraftResponse = {
  name: string
  width: number
  height: number
  canvas: { version: string; background: string; objects: Record<string, unknown>[] }
  model?: string
  quota?: { remaining?: number | null; limit?: number | null; used?: number }
}

export function AiDraftPanel() {
  const { loadCanvasDocument, setCanvasSize, canvasWidth, canvasHeight } = useEditor()
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const stored = sessionStorage.getItem(AI_PROMPT_STORAGE_KEY)
    if (stored) {
      setPrompt(stored)
      sessionStorage.removeItem(AI_PROMPT_STORAGE_KEY)
    }
  }, [])

  const generate = async () => {
    const text = prompt.trim()
    if (text.length < 3) {
      showToast('Describe the design you want (at least a few words)', 'error')
      return
    }
    setBusy(true)
    try {
      const draft = await api<DraftResponse>('POST', '/api/ai/draft', {
        prompt: text,
        width: canvasWidth,
        height: canvasHeight,
        category: 'social',
      })
      if (draft.width && draft.height) {
        setCanvasSize(draft.width, draft.height)
      }
      loadCanvasDocument(JSON.stringify(draft.canvas))
      const rem =
        draft.quota && draft.quota.remaining != null
          ? ` · ${draft.quota.remaining} AI drafts left`
          : ''
      showToast(`Draft applied${rem}`, 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'AI draft failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="flex flex-col gap-3">
      <p class="text-zinc-400 text-[11px] m-0">
        Describe a post, story, or flyer. Indobase drafts editable shapes and text on this page.
      </p>
      <textarea
        class="w-full min-h-[110px] bg-zinc-50 border border-zinc-200 rounded-md px-2 py-1.5 text-xs resize-y"
        placeholder="e.g. Diwali sale post for a saree boutique, gold accents, up to 40% off"
        value={prompt}
        onInput={(e) => setPrompt((e.target as HTMLTextAreaElement).value)}
      />
      <button
        class="inline-flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-md text-[11px] font-semibold border-none cursor-pointer bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
        onClick={generate}
        disabled={busy}
      >
        {busy ? <span class="spinner !border-white/30 !border-t-white" /> : <Sparkles size={13} />}
        {busy ? 'Drafting…' : 'Generate draft'}
      </button>
      <p class="text-[10px] text-zinc-400 m-0">
        Uses your plan’s Design AI quota. Desktop recommended for editing.
      </p>
    </div>
  )
}
