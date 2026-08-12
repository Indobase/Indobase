/**
 * Ecommerce Task Graph v1 — ordered CONTRACT → AGENT → VERIFY → REPAIR → RELEASE middle.
 * Maps existing guidedBackend steps + launchBusiness release gate; does not invent product behavior.
 */

import {
  ECOMMERCE_FUNCTIONAL_VERIFIER_IDS,
} from './ecommerce-functional-verifiers.js'
import {
  ECOMMERCE_REQUIRED_VERIFIER_IDS,
} from './ecommerce-verifiers.js'
import type { ReleaseFailureNode } from './release-gate.js'

export const ECOMMERCE_TASK_GRAPH_VERSION = 'ecommerce-task-graph/v1' as const

export type EcommerceTaskId =
  | 'T_PROVISION_BACKEND'
  | 'T_SCHEMA'
  | 'T_SEED_CATALOG'
  | 'T_PROOF_ORDER'
  | 'T_STOREFRONT_BIND'
  | 'T_ADMIN'
  | 'T_GO_LIVE_GATE'
  | 'T_PUBLISH'
  | 'T_RELEASE_MANIFEST'

export type EcommerceTaskStatus = 'pending' | 'running' | 'ok' | 'failed' | 'skipped'

export type EcommerceTask = {
  id: EcommerceTaskId
  title: string
  dependsOn?: EcommerceTaskId[]
  /** Static and/or functional verifier ids bound to this task (gate / prove). */
  boundVerifierIds?: string[]
  status: EcommerceTaskStatus
  message?: string
  /** When failed at gate — link failure_graph nodes for repair. */
  failure_graph?: ReleaseFailureNode[]
}

export type EcommerceTaskGraph = {
  version: typeof ECOMMERCE_TASK_GRAPH_VERSION
  applicationType: 'ecommerce'
  tasks: EcommerceTask[]
}

/** Compact agent/tool JSON — counts + failed/pending ids only. */
export type EcommerceTaskGraphSummary = {
  version: typeof ECOMMERCE_TASK_GRAPH_VERSION
  applicationType: 'ecommerce'
  counts: {
    pending: number
    running: number
    ok: number
    failed: number
    skipped: number
    total: number
  }
  /** Ordered task id → status for quick scan. */
  status_by_id: Record<EcommerceTaskId, EcommerceTaskStatus>
  failed_ids: EcommerceTaskId[]
  pending_ids: EcommerceTaskId[]
  next_pending?: EcommerceTaskId
  /** Present when T_GO_LIVE_GATE (or other) failed with repair nodes. */
  failure_graph?: ReleaseFailureNode[]
  repair_hints?: string[]
}

export const ECOMMERCE_TASK_IDS: readonly EcommerceTaskId[] = [
  'T_PROVISION_BACKEND',
  'T_SCHEMA',
  'T_SEED_CATALOG',
  'T_PROOF_ORDER',
  'T_STOREFRONT_BIND',
  'T_ADMIN',
  'T_GO_LIVE_GATE',
  'T_PUBLISH',
  'T_RELEASE_MANIFEST',
] as const

const TASK_DEFS: Array<{
  id: EcommerceTaskId
  title: string
  dependsOn?: EcommerceTaskId[]
  boundVerifierIds?: string[]
}> = [
  {
    id: 'T_PROVISION_BACKEND',
    title: 'Provision managed backend (ensureDatabase)',
  },
  {
    id: 'T_SCHEMA',
    title: 'Apply ecommerce blueprint schema',
    dependsOn: ['T_PROVISION_BACKEND'],
  },
  {
    id: 'T_SEED_CATALOG',
    title: 'Seed shop catalog',
    dependsOn: ['T_SCHEMA'],
  },
  {
    id: 'T_PROOF_ORDER',
    title: 'Prove checkout path (placeTestShopOrder)',
    dependsOn: ['T_SEED_CATALOG'],
  },
  {
    id: 'T_STOREFRONT_BIND',
    title: 'Bind storefront to Commerce ABI',
    dependsOn: ['T_SEED_CATALOG'],
    boundVerifierIds: ['COMMERCE_ABI_BOUND', 'NO_DIRECT_PB_ORDER_WRITE'],
  },
  {
    id: 'T_ADMIN',
    title: 'Publish admin shell',
    dependsOn: ['T_SEED_CATALOG'],
  },
  {
    id: 'T_GO_LIVE_GATE',
    title: 'Pass ApplicationContract release gate',
    dependsOn: ['T_STOREFRONT_BIND'],
    boundVerifierIds: [
      ...ECOMMERCE_REQUIRED_VERIFIER_IDS,
      ...ECOMMERCE_FUNCTIONAL_VERIFIER_IDS,
    ],
  },
  {
    id: 'T_PUBLISH',
    title: 'Publish with launchBusiness',
    dependsOn: ['T_GO_LIVE_GATE'],
  },
  {
    id: 'T_RELEASE_MANIFEST',
    title: 'Persist ReleaseManifest',
    dependsOn: ['T_PUBLISH'],
  },
]

/** GuidedBackend step.id → task id (existing pipeline only). */
export const GUIDED_STEP_TO_TASK: Readonly<Record<string, EcommerceTaskId>> = {
  ensureDatabase: 'T_PROVISION_BACKEND',
  architectureBoilerplate: 'T_SCHEMA',
  setupShopCatalog: 'T_SEED_CATALOG',
  placeTestShopOrder: 'T_PROOF_ORDER',
  wireProof: 'T_STOREFRONT_BIND',
  managedStorefront: 'T_STOREFRONT_BIND',
  launchBusiness: 'T_PUBLISH',
}

export function buildEcommerceTaskGraph(
  initialStatus: EcommerceTaskStatus = 'pending',
): EcommerceTaskGraph {
  return {
    version: ECOMMERCE_TASK_GRAPH_VERSION,
    applicationType: 'ecommerce',
    tasks: TASK_DEFS.map((def) => ({
      id: def.id,
      title: def.title,
      ...(def.dependsOn ? { dependsOn: [...def.dependsOn] } : {}),
      ...(def.boundVerifierIds ? { boundVerifierIds: [...def.boundVerifierIds] } : {}),
      status: initialStatus,
    })),
  }
}

export function cloneTaskGraph(graph: EcommerceTaskGraph): EcommerceTaskGraph {
  return {
    version: graph.version,
    applicationType: graph.applicationType,
    tasks: graph.tasks.map((t) => ({
      ...t,
      dependsOn: t.dependsOn ? [...t.dependsOn] : undefined,
      boundVerifierIds: t.boundVerifierIds ? [...t.boundVerifierIds] : undefined,
      failure_graph: t.failure_graph
        ? t.failure_graph.map((n) => ({ ...n }))
        : undefined,
    })),
  }
}

export function getTask(
  graph: EcommerceTaskGraph,
  id: EcommerceTaskId,
): EcommerceTask | undefined {
  return graph.tasks.find((t) => t.id === id)
}

export function markTask(
  graph: EcommerceTaskGraph,
  id: EcommerceTaskId,
  status: EcommerceTaskStatus,
  opts?: {
    message?: string
    failure_graph?: ReleaseFailureNode[]
  },
): EcommerceTaskGraph {
  const next = cloneTaskGraph(graph)
  const task = next.tasks.find((t) => t.id === id)
  if (!task) return next
  task.status = status
  if (opts?.message !== undefined) task.message = opts.message
  if (opts?.failure_graph !== undefined) {
    task.failure_graph = opts.failure_graph.map((n) => ({ ...n }))
  } else if (status !== 'failed') {
    delete task.failure_graph
  }
  return next
}

/**
 * Map guidedBackend steps[] onto task statuses.
 * Later steps for the same task win. Unknown step ids are ignored.
 * Admin/storefront inferred from result payloads when steps omit them.
 */
export function applyGuidedStepsToTaskGraph(
  steps: Array<{ id: string; status: string; message?: string }>,
  extras?: {
    hasStorefrontHtml?: boolean
    hasAdminHtml?: boolean
    launchOk?: boolean
    releaseManifestOk?: boolean
    gateFailed?: boolean
    failure_graph?: ReleaseFailureNode[]
  },
  base?: EcommerceTaskGraph,
): EcommerceTaskGraph {
  let graph = base ? cloneTaskGraph(base) : buildEcommerceTaskGraph('pending')

  for (const step of steps) {
    const taskId = GUIDED_STEP_TO_TASK[step.id]
    if (!taskId) continue
    const status = mapStepStatus(step.status)
    graph = markTask(graph, taskId, status, {
      message: step.message,
    })
  }

  if (extras?.hasStorefrontHtml) {
    const cur = getTask(graph, 'T_STOREFRONT_BIND')
    if (!cur || cur.status === 'pending') {
      graph = markTask(graph, 'T_STOREFRONT_BIND', 'ok', {
        message: 'storefront_html present (Commerce ABI shell)',
      })
    }
  }

  if (extras?.hasAdminHtml) {
    const cur = getTask(graph, 'T_ADMIN')
    if (!cur || cur.status === 'pending') {
      graph = markTask(graph, 'T_ADMIN', 'ok', {
        message: 'admin_html present',
      })
    }
  }

  if (extras?.gateFailed) {
    graph = markTask(graph, 'T_GO_LIVE_GATE', 'failed', {
      message: 'ApplicationContract / functional release gate failed',
      failure_graph: extras.failure_graph,
    })
  }

  if (extras?.launchOk) {
    const gate = getTask(graph, 'T_GO_LIVE_GATE')
    if (!gate || gate.status === 'pending') {
      graph = markTask(graph, 'T_GO_LIVE_GATE', 'ok', {
        message: 'Release gate passed',
      })
    }
    graph = markTask(graph, 'T_PUBLISH', 'ok', {
      message: 'launchBusiness published',
    })
  }

  if (extras?.releaseManifestOk) {
    graph = markTask(graph, 'T_RELEASE_MANIFEST', 'ok', {
      message: 'ReleaseManifest persisted',
    })
  }

  return graph
}

function mapStepStatus(status: string): EcommerceTaskStatus {
  switch (status) {
    case 'ok':
      return 'ok'
    case 'failed':
      return 'failed'
    case 'skipped':
      return 'skipped'
    case 'running':
      return 'running'
    case 'pending':
    default:
      return 'pending'
  }
}

/**
 * Update graph around launchBusiness release gate + publish + manifest.
 */
export function applyLaunchGateToTaskGraph(
  graph: EcommerceTaskGraph | null | undefined,
  outcome: {
    gateApplied: boolean
    gateOk: boolean
    published: boolean
    manifestOk: boolean
    failure_graph?: ReleaseFailureNode[]
    message?: string
  },
): EcommerceTaskGraph {
  let next = graph ? cloneTaskGraph(graph) : buildEcommerceTaskGraph('pending')

  if (!outcome.gateApplied) {
    return next
  }

  if (!outcome.gateOk) {
    return markTask(next, 'T_GO_LIVE_GATE', 'failed', {
      message: outcome.message || 'Release gate failed',
      failure_graph: outcome.failure_graph,
    })
  }

  next = markTask(next, 'T_GO_LIVE_GATE', 'ok', {
    message: 'Release gate passed',
  })

  if (outcome.published) {
    next = markTask(next, 'T_PUBLISH', 'ok', {
      message: 'launchBusiness published',
    })
  }

  if (outcome.manifestOk) {
    next = markTask(next, 'T_RELEASE_MANIFEST', 'ok', {
      message: 'ReleaseManifest persisted',
    })
  }

  return next
}

export function summarizeTaskGraph(graph: EcommerceTaskGraph): EcommerceTaskGraphSummary {
  const counts = {
    pending: 0,
    running: 0,
    ok: 0,
    failed: 0,
    skipped: 0,
    total: graph.tasks.length,
  }
  const status_by_id = {} as Record<EcommerceTaskId, EcommerceTaskStatus>
  const failed_ids: EcommerceTaskId[] = []
  const pending_ids: EcommerceTaskId[] = []
  let failure_graph: ReleaseFailureNode[] | undefined
  const repair_hints: string[] = []

  for (const task of graph.tasks) {
    counts[task.status] += 1
    status_by_id[task.id] = task.status
    if (task.status === 'failed') {
      failed_ids.push(task.id)
      if (task.failure_graph?.length) {
        failure_graph = task.failure_graph
        for (const n of task.failure_graph) {
          if (n.repair_hint?.trim()) repair_hints.push(n.repair_hint.trim())
        }
      }
    }
    if (task.status === 'pending') pending_ids.push(task.id)
  }

  return {
    version: graph.version,
    applicationType: 'ecommerce',
    counts,
    status_by_id,
    failed_ids,
    pending_ids,
    next_pending: pending_ids[0],
    ...(failure_graph ? { failure_graph } : {}),
    ...(repair_hints.length ? { repair_hints } : {}),
  }
}

/** Topological dependency order check — returns true if dependsOn always precede. */
export function taskGraphDependenciesSatisfied(graph: EcommerceTaskGraph): boolean {
  const index = new Map<EcommerceTaskId, number>()
  graph.tasks.forEach((t, i) => index.set(t.id, i))
  for (const task of graph.tasks) {
    if (!task.dependsOn) continue
    const ti = index.get(task.id)
    if (ti === undefined) return false
    for (const dep of task.dependsOn) {
      const di = index.get(dep)
      if (di === undefined || di >= ti) return false
    }
  }
  return true
}
