import { useCallback, useEffect, useState } from 'preact/hooks'
import { Save, Wand2 } from 'lucide-preact'
import { api } from '../api'
import type { BrandKit } from '../types'
import { showToast } from './toast'
import { useEditor } from '../context'

const FONT_OPTIONS = [
  'Montserrat',
  'Inter',
  'Playfair Display',
  'Poppins',
  'Lora',
  'Raleway',
  'Merriweather',
  'Open Sans',
]

export function BrandKitPanel() {
  const { applyBrandKit } = useEditor()
  const [kit, setKit] = useState<BrandKit | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const row = await api<BrandKit>('GET', '/api/brand-kit')
        setKit(row)
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Could not load brand kit', 'error')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const update = (patch: Partial<BrandKit>) => {
    setKit((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  const save = useCallback(async () => {
    if (!kit) return
    setSaving(true)
    try {
      const saved = await api<BrandKit>('PUT', '/api/brand-kit', kit)
      setKit(saved)
      showToast('Brand kit saved', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not save brand kit', 'error')
    } finally {
      setSaving(false)
    }
  }, [kit])

  const apply = useCallback(() => {
    if (!kit) return
    applyBrandKit(kit)
    showToast('Brand kit applied to canvas', 'success')
  }, [kit, applyBrandKit])

  if (loading) {
    return <p class="text-zinc-400 text-[11px]">Loading brand kit…</p>
  }
  if (!kit) {
    return <p class="text-zinc-400 text-[11px]">Brand kit unavailable.</p>
  }

  return (
    <div class="flex flex-col gap-3">
      <p class="text-zinc-400 text-[11px] m-0">
        Save your colors, fonts, and logo. Apply to update the active page.
      </p>

      <label class="block">
        <span class="text-[10px] text-zinc-500 uppercase tracking-wide">Name</span>
        <input
          class="mt-1 w-full bg-zinc-50 border border-zinc-200 rounded-md px-2 py-1.5 text-xs"
          value={kit.name}
          onInput={(e) => update({ name: (e.target as HTMLInputElement).value })}
        />
      </label>

      {(
        [
          ['primary_color', 'Primary'],
          ['secondary_color', 'Secondary'],
          ['accent_color', 'Accent'],
          ['background_color', 'Background'],
          ['text_color', 'Text'],
        ] as const
      ).map(([key, label]) => (
        <label key={key} class="flex items-center justify-between gap-2">
          <span class="text-[11px] text-zinc-600">{label}</span>
          <input
            type="color"
            class="h-8 w-12 rounded border border-zinc-200 cursor-pointer bg-transparent"
            value={kit[key]}
            onInput={(e) => update({ [key]: (e.target as HTMLInputElement).value })}
          />
        </label>
      ))}

      <label class="block">
        <span class="text-[10px] text-zinc-500 uppercase tracking-wide">Display font</span>
        <select
          class="mt-1 w-full bg-zinc-50 border border-zinc-200 rounded-md px-2 py-1.5 text-xs"
          value={kit.font_display}
          onChange={(e) => update({ font_display: (e.target as HTMLSelectElement).value })}
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>

      <label class="block">
        <span class="text-[10px] text-zinc-500 uppercase tracking-wide">Body font</span>
        <select
          class="mt-1 w-full bg-zinc-50 border border-zinc-200 rounded-md px-2 py-1.5 text-xs"
          value={kit.font_body}
          onChange={(e) => update({ font_body: (e.target as HTMLSelectElement).value })}
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>

      <label class="block">
        <span class="text-[10px] text-zinc-500 uppercase tracking-wide">Logo URL</span>
        <input
          class="mt-1 w-full bg-zinc-50 border border-zinc-200 rounded-md px-2 py-1.5 text-xs"
          placeholder="https://…"
          value={kit.logo_url || ''}
          onInput={(e) => update({ logo_url: (e.target as HTMLInputElement).value || null })}
        />
      </label>

      <button
        class="inline-flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-md text-[11px] font-semibold border-none cursor-pointer bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
        onClick={save}
        disabled={saving}
      >
        <Save size={13} />
        {saving ? 'Saving…' : 'Save brand kit'}
      </button>
      <button
        class="inline-flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-md text-[11px] font-semibold border border-zinc-300 cursor-pointer bg-white text-zinc-700 hover:bg-zinc-50"
        onClick={apply}
      >
        <Wand2 size={13} />
        Apply to canvas
      </button>
    </div>
  )
}
