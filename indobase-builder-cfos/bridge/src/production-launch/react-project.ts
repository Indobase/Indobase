/**
 * Detect a Vite + React file tree the platform can compile.
 * Paths must stay relative; no parent traversal.
 */

export function sanitizeProjectPath(rel: string): string | null {
  const cleaned = rel.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!cleaned || cleaned.includes('\0')) return null
  if (cleaned.split('/').some((part) => part === '..' || part === '.')) return null
  return cleaned
}

export function flattenSafeFiles(files: Record<string, string> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!files) return out
  for (const [raw, body] of Object.entries(files)) {
    const key = sanitizeProjectPath(raw)
    if (!key || typeof body !== 'string') continue
    out[key] = body
  }
  return out
}

export function isViteReactProject(files: Record<string, string> | null | undefined): boolean {
  const tree = flattenSafeFiles(files)
  const pkgRaw = tree['package.json']
  if (!pkgRaw || !tree['index.html']) return false
  let pkg: { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
  try {
    pkg = JSON.parse(pkgRaw) as typeof pkg
  } catch {
    return false
  }
  const build = String(pkg.scripts?.build || '')
  if (!/\bvite\s+build\b/.test(build)) return false
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
  if (!deps.react || !deps.vite) return false
  const hasTsx = Object.keys(tree).some((k) => k.startsWith('src/') && /\.tsx?$/.test(k))
  return hasTsx
}

export function viteBuildScriptError(files: Record<string, string>): string | null {
  if (!isViteReactProject(files)) {
    return 'Not a Vite + React project (need package.json with vite build, react, index.html, src/*.tsx).'
  }
  return null
}
