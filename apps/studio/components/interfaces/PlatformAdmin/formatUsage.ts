export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  const val = n / 1024 ** i
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatCount(n: number): string {
  return (n ?? 0).toLocaleString()
}
