/** Branded / opaque ids for agent runs and steps — local to agent-runtime. */

let seq = 0

function nextSuffix(): string {
  seq += 1
  const g = globalThis as { crypto?: { randomUUID?: () => string } }
  const rand =
    typeof g.crypto?.randomUUID === 'function'
      ? g.crypto.randomUUID().slice(0, 8)
      : `${Date.now()}`
  return `${Date.now().toString(36)}-${seq.toString(36)}-${rand}`
}

export function createAgentRunId(): string {
  return `arun_${nextSuffix()}`
}

export function createAgentStepId(kind = 'step'): string {
  return `astep_${kind}_${nextSuffix()}`
}
