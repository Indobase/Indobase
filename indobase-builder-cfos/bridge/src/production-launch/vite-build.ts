/**
 * Compile an agent-authored Vite + React tree to static dist/ for /live and sites.
 */

import { mkdir, rm, writeFile, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { flattenSafeFiles, sanitizeProjectPath } from './react-project.js'

export type ViteBuildResult =
  | { ok: true; html: string; files: Record<string, string>; message: string }
  | { ok: false; message: string }

export type ViteBuildRunner = (input: {
  cwd: string
  files: Record<string, string>
}) => Promise<ViteBuildResult>

function launchRoot(): string {
  return (
    process.env.INDOBASE_LAUNCH_ROOT?.trim() ||
    path.join(process.cwd(), '.indobase-launches')
  )
}

async function writeTree(root: string, files: Record<string, string>): Promise<void> {
  for (const [rel, body] of Object.entries(files)) {
    const safe = sanitizeProjectPath(rel)
    if (!safe) continue
    const dest = path.join(root, safe)
    await mkdir(path.dirname(dest), { recursive: true })
    await writeFile(dest, body, 'utf8')
  }
}

async function readDist(distDir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  async function walk(dir: string, prefix: string) {
    let entries: Awaited<ReturnType<typeof readdir>>
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full, rel)
      } else if (entry.isFile()) {
        const buf = await readFile(full)
        out[rel] = buf.toString('utf8')
      }
    }
  }
  await walk(distDir, '')
  return out
}

function runCmd(cwd: string, command: string, args: string[], timeoutMs: number): Promise<{ code: number; log: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, NODE_ENV: 'production', CI: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let log = ''
    child.stdout?.on('data', (d) => {
      log += String(d)
    })
    child.stderr?.on('data', (d) => {
      log += String(d)
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
    }, timeoutMs)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, log: log.slice(-4000) })
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: 1, log: err.message })
    })
  })
}

export async function buildViteReactApp(
  files: Record<string, string>,
  projectRef: string,
): Promise<ViteBuildResult> {
  const tree = flattenSafeFiles(files)
  const work = path.join(launchRoot(), 'react-build', projectRef.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 64) || 'app')
  await rm(work, { recursive: true, force: true })
  await mkdir(work, { recursive: true })
  await writeTree(work, tree)
  const install = await runCmd(work, 'npm', ['install', '--include=dev', '--no-audit', '--no-fund'], 180_000)
  if (install.code !== 0) {
    return { ok: false, message: `npm install failed: ${install.log.slice(-800)}` }
  }
  const build = await runCmd(work, 'npx', ['vite', 'build'], 180_000)
  if (build.code !== 0) {
    return { ok: false, message: `vite build failed: ${build.log.slice(-800)}` }
  }
  const dist = await readDist(path.join(work, 'dist'))
  const html = dist['index.html']
  if (!html) {
    return { ok: false, message: 'vite build produced no dist/index.html' }
  }
  return {
    ok: true,
    html,
    files: dist,
    message: 'Vite React app compiled to dist/',
  }
}
