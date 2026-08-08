import type { AgentMemory, AgentMemoryNote } from './types'

/**
 * In-process append-only memory keyed by runId / projectRef.
 * No vector DB, no durability — Gen-1 scratchpad for injectors / tests.
 */
export type AgentMemoryStore = {
  append(
    runId: string,
    text: string,
    meta?: { projectRef?: string; tags?: string[] },
  ): AgentMemoryNote
  list(runId: string): AgentMemoryNote[]
  listByProject(projectRef: string): AgentMemoryNote[]
  get(runId: string): AgentMemory | undefined
  clear(runId?: string): void
}

export function createAgentMemoryStore(): AgentMemoryStore {
  const byRun = new Map<string, AgentMemory>()

  return {
    append(runId, text, meta = {}) {
      const note: AgentMemoryNote = {
        at: new Date().toISOString(),
        text,
        tags: meta.tags,
        projectRef: meta.projectRef,
      }
      let mem = byRun.get(runId)
      if (!mem) {
        mem = { runId, projectRef: meta.projectRef, notes: [] }
        byRun.set(runId, mem)
      } else if (meta.projectRef && !mem.projectRef) {
        mem.projectRef = meta.projectRef
      }
      mem.notes.push(note)
      return note
    },
    list(runId) {
      return [...(byRun.get(runId)?.notes ?? [])]
    },
    listByProject(projectRef) {
      const out: AgentMemoryNote[] = []
      for (const mem of byRun.values()) {
        for (const note of mem.notes) {
          if (note.projectRef === projectRef || mem.projectRef === projectRef) {
            out.push(note)
          }
        }
      }
      return out
    },
    get(runId) {
      const mem = byRun.get(runId)
      return mem ? { ...mem, notes: [...mem.notes] } : undefined
    },
    clear(runId) {
      if (runId) {
        byRun.delete(runId)
      } else {
        byRun.clear()
      }
    },
  }
}
