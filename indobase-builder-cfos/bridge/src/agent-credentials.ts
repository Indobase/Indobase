/**
 * Per-session CFOS runtime principals (username/password derived from Indobase session).
 * Replaces shared VITE_DEV_USERNAME=dev / VITE_DEV_PASSWORD=devpassword for isolation.
 * Never log the password.
 */
import { createHash, createHmac } from 'node:crypto'

export type AgentCredentials = {
  username: string
  password: string
  storage_key: string
}

export function agentAuthStorageKey(projectRef: string, gotrueId: string): string {
  return `indobase.cfos.auth.${projectRef}.${gotrueId}`
}

/** Stable CFOS username: ib_ + first 16 hex of sha256(gotrueId:projectRef). */
export function deriveAgentUsername(gotrueId: string, projectRef: string): string {
  const hex = createHash('sha256').update(`${gotrueId}:${projectRef}`, 'utf8').digest('hex')
  return `ib_${hex.slice(0, 16)}`
}

/**
 * Password = base64url(HMAC-SHA256(handoffSecret, `cfos-agent:${gotrueId}:${projectRef}`))
 * truncated to 32 chars.
 */
export function deriveAgentPassword(
  handoffSecret: string,
  gotrueId: string,
  projectRef: string,
): string {
  const digest = createHmac('sha256', handoffSecret)
    .update(`cfos-agent:${gotrueId}:${projectRef}`, 'utf8')
    .digest()
  return digest
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
    .slice(0, 32)
}

export function deriveAgentCredentials(input: {
  handoffSecret: string
  gotrueId: string
  projectRef: string
}): AgentCredentials {
  const { handoffSecret, gotrueId, projectRef } = input
  return {
    username: deriveAgentUsername(gotrueId, projectRef),
    password: deriveAgentPassword(handoffSecret, gotrueId, projectRef),
    storage_key: agentAuthStorageKey(projectRef, gotrueId),
  }
}
