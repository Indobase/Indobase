/**
 * In-memory Control Center screen — so agent_hint knows what the operator is looking at.
 * Not an agent tool.
 */
import type { WorkspaceScreen } from './ux-conductor.js'

const screens = new Map<string, WorkspaceScreen>()

export function setWorkspaceScreen(projectRef: string, screen: WorkspaceScreen): WorkspaceScreen {
  const next: WorkspaceScreen = {
    section: (screen.section || 'overview').trim() || 'overview',
    entityId: screen.entityId?.trim() || null,
    label: screen.label?.trim() || null,
  }
  screens.set(projectRef.trim(), next)
  return next
}

export function getWorkspaceScreen(projectRef: string): WorkspaceScreen | null {
  const ref = projectRef.trim()
  return ref ? screens.get(ref) || null : null
}

export function clearWorkspaceScreensForTests(): void {
  screens.clear()
}
