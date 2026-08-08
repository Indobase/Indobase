/**
 * Map CFOS runtime usernames (ib_…) → Indobase session principals.
 * Written when the browser fetches /api/os/runtime/agent-credentials.
 * Used by the CFOS launchBusiness AgentTool (workerd has no session cookies).
 */
import fs from 'node:fs/promises'
import path from 'node:path'

export type AgentPrincipalRecord = {
  username: string
  gotrueId: string
  projectRef: string
  email: string
  guest: boolean
  projectName?: string
  updatedAt: string
}

type StoreFile = {
  version: 1
  principals: Record<string, AgentPrincipalRecord>
}

function storePath(): string {
  const root =
    process.env.INDOBASE_AGENT_PRINCIPAL_DIR?.trim() ||
    process.env.INDOBASE_LAUNCH_ROOT?.trim() ||
    path.join(process.cwd(), '.indobase-launches')
  return path.join(root, 'agent-principals.json')
}

async function readStore(): Promise<StoreFile> {
  try {
    const raw = await fs.readFile(storePath(), 'utf8')
    const parsed = JSON.parse(raw) as StoreFile
    if (!parsed || parsed.version !== 1 || typeof parsed.principals !== 'object') {
      return { version: 1, principals: {} }
    }
    return parsed
  } catch {
    return { version: 1, principals: {} }
  }
}

async function writeStore(store: StoreFile): Promise<void> {
  const file = storePath()
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf8')
  await fs.rename(tmp, file)
}

export async function rememberAgentPrincipal(
  record: Omit<AgentPrincipalRecord, 'updatedAt'> & { updatedAt?: string },
): Promise<void> {
  const username = record.username.trim()
  if (!username) return
  const store = await readStore()
  store.principals[username] = {
    username,
    gotrueId: record.gotrueId,
    projectRef: record.projectRef,
    email: record.email,
    guest: Boolean(record.guest),
    projectName: record.projectName,
    updatedAt: record.updatedAt || new Date().toISOString(),
  }
  await writeStore(store)
}

export async function lookupAgentPrincipal(
  username: string,
): Promise<AgentPrincipalRecord | null> {
  const key = username.trim()
  if (!key) return null
  const store = await readStore()
  return store.principals[key] || null
}
