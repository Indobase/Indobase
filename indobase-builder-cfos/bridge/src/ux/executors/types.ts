import type { Session } from '../../auth.js'
import type { ProductionLaunchDeps, ProductionLaunchExecuteResult } from '../../production-launch/index.js'
import type { probePreviewHttp } from '../../static-launch.js'
import type { BusinessSnapshotSummary } from '../agent-truth.js'
import type { BusinessSpec } from '../business-spec.js'
import type { PersistedWorkspaceRuntime } from '../runtime-store.js'
import type { StoreCommandDeps, StoreCommandResult } from '../store-commands.js'
import type { ExecutionPlan } from '../execution-plan.js'

export type ExecutorContext = {
  session: Session
  message: string
  specSource: string
  probe?: typeof probePreviewHttp
  launchDeps?: ProductionLaunchDeps
  catalogDeps?: StoreCommandDeps
  snapshot?: BusinessSnapshotSummary | null
  runtime: PersistedWorkspaceRuntime
}

export type ExecutorResult = {
  runtime: PersistedWorkspaceRuntime
  spec?: BusinessSpec | null
  launch?: ProductionLaunchExecuteResult | null
  recovered: boolean
  commandId?: string
  store?: StoreCommandResult | null
  snapshot?: BusinessSnapshotSummary | null
  mutatedHeadline?: string | null
  mutated?: boolean
  plan: ExecutionPlan
}
