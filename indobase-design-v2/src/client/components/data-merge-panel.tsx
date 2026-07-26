import { useMemo, useState } from 'preact/hooks'
import { Database } from 'lucide-preact'
import { useEditor } from '../context'
import {
  extractPlaceholderKeysFromCanvasJson,
  mergeCanvasJson,
  parseMergeData,
} from '../utils/data-merge'
import { showToast } from './toast'

export function DataMergePanel() {
  const { getCanvasJSON, loadCanvasDocument } = useEditor()
  const [raw, setRaw] = useState(
    '{\n  "product_name": "Paneer Tikka",\n  "price": "₹220",\n  "business_name": "Your Business"\n}'
  )

  const keys = useMemo(() => {
    try {
      return extractPlaceholderKeysFromCanvasJson(getCanvasJSON())
    } catch {
      return []
    }
  }, [getCanvasJSON])

  const apply = () => {
    try {
      const data = parseMergeData(raw)
      const merged = mergeCanvasJson(getCanvasJSON(), data)
      loadCanvasDocument(merged)
      showToast('Business data merged into text', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not merge data', 'error')
    }
  }

  return (
    <div class="flex flex-col gap-3">
      <p class="text-zinc-400 text-[11px] m-0">
        Replace <code class="text-[10px]">{'{{field}}'}</code> placeholders in text with JSON or CSV.
      </p>
      {keys.length > 0 ? (
        <p class="text-[10px] text-zinc-500 m-0">
          Found on canvas: {keys.map((k) => `{{${k}}}`).join(', ')}
        </p>
      ) : (
        <p class="text-[10px] text-zinc-400 m-0">
          No placeholders on this page yet — try a template with {'{{product_name}}'} fields.
        </p>
      )}
      <textarea
        class="w-full min-h-[140px] bg-zinc-50 border border-zinc-200 rounded-md px-2 py-1.5 text-[11px] font-mono resize-y"
        value={raw}
        onInput={(e) => setRaw((e.target as HTMLTextAreaElement).value)}
      />
      <button
        class="inline-flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-md text-[11px] font-semibold border-none cursor-pointer bg-accent text-white hover:bg-accent-hover"
        onClick={apply}
      >
        <Database size={13} />
        Merge into canvas
      </button>
    </div>
  )
}
