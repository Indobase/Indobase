export function scheduleIdleWork(task: () => void, timeoutMs: number = 4000) {
  if (typeof window === 'undefined') {
    return
  }

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(task, { timeout: timeoutMs })
    return
  }

  window.setTimeout(task, Math.min(timeoutMs, 500))
}
