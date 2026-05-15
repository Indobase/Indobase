import { useParams } from 'common'
import { useBackfillTenantDataPlaneDbMutation } from 'data/projects/project-backfill-tenant-db-mutation'
import { useProvisionDataPlaneMutation } from 'data/projects/project-provision-data-plane-mutation'
import { useTenantDataPlaneStackQuery } from 'data/projects/project-tenant-data-plane-query'
import { IS_SAAS } from 'lib/constants'
import {
  ScaffoldSection,
  ScaffoldSectionContent,
  ScaffoldSectionDetail,
} from 'components/layouts/Scaffold'
import { Button } from 'ui'
import { Admonition } from 'ui-patterns/admonition'
import { ResponseError } from 'types'

export const DataPlanePanel = () => {
  const { ref } = useParams()
  const { data, isPending, isError, error, refetch } = useTenantDataPlaneStackQuery(ref)
  const provision = useProvisionDataPlaneMutation()
  const backfill = useBackfillTenantDataPlaneDbMutation()

  if (!IS_SAAS || !ref) return null

  const tenantUrl = data?.tenant_api_url
  const lastAt = data?.data_plane_last_provisioned_at
  const lastResult = data?.data_plane_last_provision_result as
    | { written?: { composePath?: string; traefikPath?: string }; applied?: boolean }
    | undefined

  const provisionErr = provision.error instanceof ResponseError ? provision.error : null
  const provisionDetail =
    provisionErr?.jsonBody?.provisioner_body ?? provisionErr?.jsonBody ?? null
  const provisionHttp =
    provisionErr?.code ??
    (typeof provisionErr?.jsonBody?.provisioner_status === 'number'
      ? (provisionErr.jsonBody.provisioner_status as number)
      : undefined)

  return (
    <ScaffoldSection data-testid="data-plane-panel">
      <ScaffoldSectionDetail>
        <h4 className="text-base capitalize m-0">Dedicated data plane</h4>
        <p className="text-foreground-light text-sm pr-8 mt-1">
          Per-project PostgREST, Auth, Storage, Realtime, and Edge Functions on the host provisioner.
          API URL pattern for clients:{' '}
          <span className="font-mono text-xs">{`<ref>.<public-domain>`}</span>.
        </p>
      </ScaffoldSectionDetail>
      <ScaffoldSectionContent className="flex flex-col gap-3">
        {provision.isError && provisionErr ? (
          <Admonition
            type="warning"
            title="Last provision request failed"
            description={
              <div className="space-y-2">
                <p className="text-sm m-0">{provisionErr.message}</p>
                {provisionHttp != null ? (
                  <p className="text-xs text-foreground-light m-0">HTTP status: {provisionHttp}</p>
                ) : null}
                {provisionDetail != null ? (
                  <pre className="text-xs font-mono bg-surface-200 p-2 rounded overflow-auto max-h-56 whitespace-pre-wrap break-words border border-strong">
                    {JSON.stringify(provisionDetail, null, 2)}
                  </pre>
                ) : null}
                <div>
                  <Button type="default" size="tiny" onClick={() => provision.reset()}>
                    Dismiss
                  </Button>
                </div>
              </div>
            }
          />
        ) : null}
        {isPending ? (
          <p className="text-sm text-foreground-light">Loading data plane status…</p>
        ) : isError ? (
          <Admonition
            type="warning"
            title="Could not load tenant stack"
            description={error instanceof Error ? error.message : 'Unknown error'}
          />
        ) : !data ? (
          <Admonition
            type="note"
            title="Shared database mode"
            description="This project uses the platform Kong stack. Dedicated data plane controls apply only when each project has its own Postgres database."
          />
        ) : (
          <>
            {tenantUrl ? (
              <p className="text-sm m-0">
                <span className="text-foreground-light">Tenant API base: </span>
                <a href={tenantUrl} className="underline break-all" target="_blank" rel="noreferrer">
                  {tenantUrl}
                </a>
              </p>
            ) : null}
            {data.tenant_pooler ? (
              <p className="text-sm m-0">
                <span className="text-foreground-light">Pooler endpoint (SAAS_TENANT_POOLER_HOST): </span>
                <span className="font-mono text-xs break-all">
                  {data.tenant_pooler.host}:{data.tenant_pooler.port}
                </span>
              </p>
            ) : null}
            {lastAt ? (
              <p className="text-sm text-foreground-light m-0">
                Last provision: {new Date(lastAt).toLocaleString()}
                {lastResult?.written?.composePath ? (
                  <>
                    {' '}
                    · compose:{' '}
                    <span className="font-mono text-xs">{lastResult.written.composePath}</span>
                  </>
                ) : null}
                {typeof lastResult?.applied === 'boolean' ? ` · applied: ${lastResult.applied}` : null}
              </p>
            ) : (
              <p className="text-sm text-foreground-light m-0">Not provisioned on the host yet.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="primary"
                loading={provision.isPending}
                disabled={provision.isPending}
                onClick={() => provision.mutate({ ref, apply: true })}
              >
                Write compose &amp; apply
              </Button>
              <Button
                type="default"
                loading={provision.isPending}
                disabled={provision.isPending}
                onClick={() => provision.mutate({ ref, apply: false })}
              >
                Write files only
              </Button>
              <Button type="default" onClick={() => refetch()}>
                Refresh status
              </Button>
              <Button
                type="warning"
                loading={backfill.isPending}
                disabled={backfill.isPending}
                onClick={() => backfill.mutate({ ref })}
              >
                Repair DB bootstrap
              </Button>
            </div>
            <p className="text-xs text-foreground-light m-0">
              &quot;Repair DB bootstrap&quot; re-runs SQL roles/schemas for older dedicated databases
              (safe to run more than once). Requires Studio server access to Postgres admin credentials.
            </p>
          </>
        )}
      </ScaffoldSectionContent>
    </ScaffoldSection>
  )
}
