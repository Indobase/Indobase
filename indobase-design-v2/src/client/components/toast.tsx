import { useEffect, useState } from 'preact/hooks'

type ToastKind = 'info' | 'success' | 'error'

type Toast = {
  id: number
  message: string
  kind: ToastKind
}

let listeners: Array<(t: Toast | null) => void> = []
let seq = 0

export function showToast(message: string, kind: ToastKind = 'info') {
  const toast: Toast = { id: ++seq, message, kind }
  for (const l of listeners) l(toast)
}

export function ToastHost() {
  const [toast, setToast] = useState<Toast | null>(null)

  useEffect(() => {
    listeners.push(setToast)
    return () => {
      listeners = listeners.filter((l) => l !== setToast)
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3800)
    return () => clearTimeout(t)
  }, [toast])

  if (!toast) return null

  const colors =
    toast.kind === 'error'
      ? 'bg-red-600 text-white'
      : toast.kind === 'success'
        ? 'bg-emerald-600 text-white'
        : 'bg-zinc-900 text-white'

  return (
    <div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] max-w-[90vw]">
      <div class={`px-4 py-2.5 rounded-lg shadow-lg text-xs font-medium ${colors}`}>
        {toast.message}
      </div>
    </div>
  )
}
