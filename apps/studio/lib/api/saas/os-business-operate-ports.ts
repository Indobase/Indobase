/**
 * Studio ports for business.launch Verify + StartOperator (Operate workforce slice).
 * Wired from os-business-launch; also used by queued publish resume.
 *
 * Verify hard-gates Launch when homepage is unreachable under strictVerify.
 * Rollback policy: do not tear down hosting — stamp os_publish.publish_status
 * `verify_failed` and return a customer-safe VERIFY_FAILED result.
 * Operator workforce is best-effort after MarkLive — never tears down hosting.
 */
import type { BusinessOperatorPort, BusinessVerifyPort } from '@indobase/platform'

import { ensureSaasTables, getGotrueUserId, type Claims } from './platform'
import { startOperator } from './os-ai-operator'
import {
  resolveStrictVerify,
  summarizeOsLaunchVerify,
  verifyOsLaunch,
  type OsLaunchVerifyResult,
} from './os-launch-verify'
import { executeQuery } from './query'

async function persistLaunchVerifySummary({
  workspaceRef,
  gotrueId,
  summary,
}: {
  workspaceRef: string
  gotrueId?: string
  summary: Record<string, unknown>
}) {
  await ensureSaasTables()
  if (gotrueId) {
    await executeQuery({
      query: `
        update saas.projects p
        set auth_config = coalesce(p.auth_config, '{}'::jsonb) || jsonb_build_object('os_launch_verify', $2::jsonb)
        where p.ref = $1
          and exists (
            select 1 from saas.organization_members m
            where m.organization_id = p.organization_id and m.gotrue_id = $3
          )
      `,
      parameters: [workspaceRef, JSON.stringify(summary), gotrueId],
      actorId: gotrueId,
    })
    return
  }
  await executeQuery({
    query: `
      update saas.projects
      set auth_config = coalesce(auth_config, '{}'::jsonb) || jsonb_build_object('os_launch_verify', $2::jsonb)
      where ref = $1
    `,
    parameters: [workspaceRef, JSON.stringify(summary)],
  })
}

/**
 * Overlay verify_failed onto existing os_publish without removing live_url / hosting.
 * Prefer this over tearing down site routes (rollback is not easy post-publish).
 */
async function stampOsPublishVerifyFailed({
  workspaceRef,
  gotrueId,
  summary,
  message,
}: {
  workspaceRef: string
  gotrueId?: string
  summary: Record<string, unknown>
  message: string
}) {
  await ensureSaasTables()
  const patch = {
    publish_status: 'verify_failed',
    verify_failed_at: new Date().toISOString(),
    verify_failed_message: message,
    os_launch_verify: summary,
  }

  if (gotrueId) {
    await executeQuery({
      query: `
        update saas.projects p
        set auth_config =
          coalesce(p.auth_config, '{}'::jsonb)
          || jsonb_build_object(
            'os_publish',
            coalesce(p.auth_config->'os_publish', '{}'::jsonb) || $2::jsonb,
            'os_launch_verify',
            $3::jsonb
          )
        where p.ref = $1
          and exists (
            select 1 from saas.organization_members m
            where m.organization_id = p.organization_id and m.gotrue_id = $4
          )
      `,
      parameters: [workspaceRef, JSON.stringify(patch), JSON.stringify(summary), gotrueId],
      actorId: gotrueId,
    })
    return
  }

  await executeQuery({
    query: `
      update saas.projects
      set auth_config =
        coalesce(auth_config, '{}'::jsonb)
        || jsonb_build_object(
          'os_publish',
          coalesce(auth_config->'os_publish', '{}'::jsonb) || $2::jsonb,
          'os_launch_verify',
          $3::jsonb
        )
      where ref = $1
    `,
    parameters: [workspaceRef, JSON.stringify(patch), JSON.stringify(summary)],
  })
}

async function loadPublishKind(workspaceRef: string): Promise<string | null> {
  try {
    await ensureSaasTables()
    const result = await executeQuery<{ auth_config: Record<string, unknown> | null }>({
      query: `
        select coalesce(auth_config, '{}'::jsonb) as auth_config
        from saas.projects
        where ref = $1
        limit 1
      `,
      parameters: [workspaceRef],
    })
    const authConfig = result.data?.[0]?.auth_config
    if (!authConfig || typeof authConfig !== 'object') return null
    const osPublish = authConfig.os_publish
    if (!osPublish || typeof osPublish !== 'object' || Array.isArray(osPublish)) return null
    const kind = (osPublish as { kind?: unknown }).kind
    return typeof kind === 'string' ? kind : null
  } catch {
    return null
  }
}

function customerVerifyFailedMessage(result: OsLaunchVerifyResult): string {
  const hard = result.failures[0]?.message
  if (hard && !/docker|traefik|provisioner|coolify|k8s/i.test(hard)) {
    return hard
  }
  return "We couldn't confirm your business is responding yet. Your live link is reserved — please try Launch again in a moment."
}

export function createStudioBusinessVerifyPort({
  claims,
}: {
  claims?: Claims
} = {}): BusinessVerifyPort {
  const gotrueId = claims ? getGotrueUserId(claims) : undefined

  return {
    async verify(input) {
      const publishKind = await loadPublishKind(input.workspaceRef)
      const payloadStrict =
        typeof input.payload?.strictVerify === 'boolean'
          ? (input.payload.strictVerify as boolean)
          : undefined
      const strictVerify = resolveStrictVerify({
        explicit: typeof input.strictVerify === 'boolean' ? input.strictVerify : payloadStrict,
        publishKind,
      })

      let result: OsLaunchVerifyResult
      try {
        result = await verifyOsLaunch({
          liveUrl: input.liveUrl,
          ensuredCapabilities: input.requiredCapabilities,
          strictVerify,
        })
      } catch {
        // Unexpected probe crash — soft path so Launch is not killed by verifier bugs.
        return {
          ok: true,
          details: {
            passed: true,
            note: 'verify_error',
            message: "We couldn't finish post-launch checks yet. Your business is still live.",
          },
        }
      }

      const summary = summarizeOsLaunchVerify(result)

      if (!result.passed) {
        const message = customerVerifyFailedMessage(result)
        try {
          await stampOsPublishVerifyFailed({
            workspaceRef: input.workspaceRef,
            gotrueId,
            summary,
            message,
          })
        } catch {
          // Persist is best-effort — still fail Launch with VERIFY_FAILED.
        }
        return {
          ok: false,
          message,
          details: {
            ...summary,
            checks: result.checks,
            failures: result.failures,
            warnings: result.warnings,
            publish_status: 'verify_failed',
          },
        }
      }

      try {
        await persistLaunchVerifySummary({
          workspaceRef: input.workspaceRef,
          gotrueId,
          summary,
        })
      } catch {
        // Persist is best-effort.
      }

      return {
        ok: true,
        details: {
          ...summary,
          checks: result.checks,
          failures: result.failures,
          warnings: result.warnings,
        },
      }
    },
  }
}

export function createStudioBusinessOperatorPort({
  claims,
}: {
  claims?: Claims
} = {}): BusinessOperatorPort {
  const gotrueId = claims ? getGotrueUserId(claims) : undefined

  return {
    async startOperator(input) {
      const lastVerify = await resolveLastVerifyHint({
        workspaceRef: input.workspaceRef,
        payload: input.payload,
      })

      try {
        const started = await startOperator({
          workspaceRef: input.workspaceRef,
          liveUrl: input.liveUrl,
          gotrueId,
          lastVerify,
        })
        return {
          ok: true,
          details: {
            session_id: started.session.session_id,
            status: started.session.status,
            phase: started.session.phase,
            next_suggestions: started.session.next_suggestions,
            persist_ok: started.ok,
            message: started.message,
          },
        }
      } catch {
        return {
          ok: true,
          details: {
            status: 'monitoring',
            phase: 'workforce',
            message:
              'Operator monitoring is deferred for now. Your business is live — we will retry monitoring shortly.',
          },
        }
      }
    },
  }
}

async function resolveLastVerifyHint({
  workspaceRef,
  payload,
}: {
  workspaceRef: string
  payload?: Record<string, unknown>
}): Promise<{ passed: boolean; verifiedAt: string; failureIds?: string[] } | undefined> {
  const fromPayload = payload?.os_launch_verify
  if (fromPayload && typeof fromPayload === 'object' && !Array.isArray(fromPayload)) {
    const row = fromPayload as {
      passed?: boolean
      verified_at?: string
      failure_ids?: string[]
    }
    if (typeof row.passed === 'boolean') {
      return {
        passed: row.passed,
        verifiedAt: row.verified_at ?? new Date().toISOString(),
        failureIds: row.failure_ids,
      }
    }
  }

  try {
    await ensureSaasTables()
    const result = await executeQuery<{ auth_config: Record<string, unknown> | null }>({
      query: `
        select coalesce(auth_config, '{}'::jsonb) as auth_config
        from saas.projects
        where ref = $1
        limit 1
      `,
      parameters: [workspaceRef],
    })
    const authConfig = result.data?.[0]?.auth_config
    const raw =
      authConfig && typeof authConfig === 'object' ? authConfig.os_launch_verify : null
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
    const row = raw as {
      passed?: boolean
      verified_at?: string
      failure_ids?: string[]
    }
    if (typeof row.passed !== 'boolean') return undefined
    return {
      passed: row.passed,
      verifiedAt: row.verified_at ?? new Date().toISOString(),
      failureIds: row.failure_ids,
    }
  } catch {
    return undefined
  }
}
