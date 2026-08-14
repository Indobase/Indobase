/**
 * host → projectRef ownership. New projects never inherit another workspace's live host.
 */

import { assertHostOwnedByProject, canonicalHostLabel, type HostBinding } from '../../../../packages/platform/src/business/artifact.ts'

import { persistGen3Record, loadGen3Record } from './gen3-durable.js'

const byHost = new Map<string, HostBinding>()
const byProject = new Map<string, HostBinding>()

export function bindHostToProject(input: {
  host: string
  projectRef: string
  applicationId?: string
  artifactId?: string
}): { ok: true; binding: HostBinding } | { ok: false; error: string; owner?: string } {
  const host = (input.host || '').trim().toLowerCase()
  const projectRef = (input.projectRef || '').trim()
  if (!host || !projectRef) return { ok: false, error: 'host_or_project_missing' }
  const existing = byHost.get(host)
  if (existing && existing.projectRef !== projectRef) {
    return { ok: false, error: 'host_owned_by_other_project', owner: existing.projectRef }
  }
  const binding: HostBinding = {
    host,
    projectRef,
    applicationId: input.applicationId || projectRef,
    artifactId: input.artifactId,
  }
  byHost.set(host, binding)
  byProject.set(projectRef, binding)
  persistGen3Record('hosts', host.replace(/[^a-z0-9.-]+/g, '-'), binding)
  persistGen3Record('hosts-by-project', projectRef, binding)
  return { ok: true, binding }
}

export function hostBindingForProject(projectRef: string): HostBinding | undefined {
  return byProject.get((projectRef || '').trim())
}

export function hostBindingForHost(host: string): HostBinding | undefined {
  const key = (host || '').trim().toLowerCase()
  const cached = byHost.get(key)
  if (cached) return cached
  const disk = loadGen3Record<HostBinding>('hosts', key.replace(/[^a-z0-9.-]+/g, '-'))
  if (disk) byHost.set(key, disk)
  return disk || undefined
}

export function assertProjectMayUseHost(host: string, projectRef: string) {
  return assertHostOwnedByProject(hostBindingForHost(host), projectRef)
}

export function deterministicHostForProject(projectRef: string): string {
  return `${canonicalHostLabel(projectRef)}.sites.indobase.in`
}
