import Link from 'next/link'

import { BuilderLaunchButton } from 'components/interfaces/ProjectExperienceChooser/BuilderLaunchButton'
import { useProjectDeploymentsQuery } from 'data/hosting/project-deployments-query'
import { useProjectHostingQuery } from 'data/hosting/project-hosting-query'
import { useSelectedProjectQuery } from 'hooks/misc/useSelectedProject'
import { Card, CardContent } from 'ui'
import { Input } from 'ui-patterns/DataInputs/Input'
import {
  PageSection,
  PageSectionContent,
  PageSectionDescription,
  PageSectionMeta,
  PageSectionSummary,
  PageSectionTitle,
} from 'ui-patterns/PageSection'
import { GenericSkeletonLoader } from 'ui-patterns/ShimmeringLoader'

const CUSTOM_DOMAIN_STATUS_LABELS: Record<string, string> = {
  '0_no_hostname_configured': 'Not configured',
  '1_not_started': 'Needs verification',
  '2_initiated': 'Verifying ownership',
  '3_challenge_verified': 'Ownership verified',
  '4_origin_setup_completed': 'Ready to activate',
  '5_services_reconfigured': 'Active',
}

const DEPLOYMENT_STATUS_LABELS: Record<string, string> = {
  archived: 'Archived',
  building: 'Building',
  failed: 'Failed',
  ready: 'Ready',
  requested: 'Requested',
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function getDeploymentExecutorSummary(metadata: Record<string, unknown>) {
  const executor = asRecord(metadata.executor)
  const attemptCount = typeof executor.attempt_count === 'number' ? executor.attempt_count : null
  const attemptErrorCount =
    typeof executor.attempt_error_count === 'number' ? executor.attempt_error_count : null
  const heartbeatAt = typeof executor.heartbeat_at === 'string' ? executor.heartbeat_at : null
  const lastAttemptedAt =
    typeof executor.last_attempted_at === 'string' ? executor.last_attempted_at : null
  const leaseExpiresAt =
    typeof executor.lease_expires_at === 'string' ? executor.lease_expires_at : null
  const workerId = typeof executor.worker_id === 'string' ? executor.worker_id : null
  const health = asRecord(metadata.deployment_health)
  const healthStatusCode = typeof health.status_code === 'number' ? health.status_code : null
  const healthCheckedAt = typeof health.checked_at === 'string' ? health.checked_at : null

  return {
    attemptCount,
    attemptErrorCount,
    heartbeatAt,
    healthCheckedAt,
    healthStatusCode,
    lastAttemptedAt,
    leaseExpiresAt,
    workerId,
  }
}

export const ProjectHostingConfig = () => {
  const { data: project } = useSelectedProjectQuery()
  const { data, isPending } = useProjectHostingQuery({ projectRef: project?.ref })
  const { data: deploymentsData, isPending: isDeploymentsPending } = useProjectDeploymentsQuery({
    projectRef: project?.ref,
  })

  const deployments = deploymentsData?.deployments ?? []
  const hasActiveDeployment = deployments.some(
    (deployment) => deployment.status === 'requested' || deployment.status === 'building'
  )
  const latestReadyDeployment = deployments.find((deployment) => deployment.status === 'ready')

  return (
    <PageSection id="hosting">
      <PageSectionMeta>
        <PageSectionSummary>
          <PageSectionTitle>Indobase Hosting</PageSectionTitle>
          <PageSectionDescription>
            Run your product on an Indobase-managed subdomain or bring your own domain.
          </PageSectionDescription>
        </PageSectionSummary>
      </PageSectionMeta>
      <PageSectionContent>
        {isPending || !project ? (
          <GenericSkeletonLoader />
        ) : (
          <Card>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm">Managed subdomain</p>
                  <Input copy readOnly size="small" value={data?.hosting.default_url ?? ''} />
                  <p className="text-sm text-foreground-light">
                    {data?.hosting.uses_dedicated_subdomain
                      ? 'Traffic resolves on a project-specific Indobase subdomain.'
                      : 'This project currently falls back to the shared Indobase API host.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm">Current active URL</p>
                  <Input copy readOnly size="small" value={data?.hosting.active_url ?? ''} />
                  <p className="text-sm text-foreground-light">
                    {data?.hosting.custom_domain.configured
                      ? 'Custom domain is configured and takes precedence when active.'
                      : 'Your Indobase-managed subdomain is the current public entry point.'}
                  </p>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm">Custom domain</p>
                  <Input
                    copy={Boolean(data?.hosting.custom_domain.url)}
                    readOnly
                    size="small"
                    value={data?.hosting.custom_domain.url ?? 'Not configured'}
                  />
                  <p className="text-sm text-foreground-light">
                    Status:{' '}
                    {CUSTOM_DOMAIN_STATUS_LABELS[data?.hosting.custom_domain.status ?? ''] ??
                      data?.hosting.custom_domain.status ??
                      'Unknown'}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm">Publish</p>
                  <div className="flex flex-col gap-2 text-sm text-foreground-light">
                    <BuilderLaunchButton
                      projectRef={project.ref}
                      nextPath="/?deploy=indobase"
                      type="primary"
                      disabled={hasActiveDeployment}
                    >
                      {hasActiveDeployment ? 'Deployment in progress' : 'Publish in Builder'}
                    </BuilderLaunchButton>
                    <p>
                      One click opens Builder, builds your app, and publishes to your Indobase subdomain.
                    </p>
                    {latestReadyDeployment?.target_url && (
                      <Link href={latestReadyDeployment.target_url} className="text-brand" target="_blank" rel="noreferrer">
                        Open live site
                      </Link>
                    )}
                    <Link href={`/project/${project.ref}/settings/general#custom-domains`} className="text-brand">
                      Configure or verify custom domain
                    </Link>
                    <Link href={`/project/${project.ref}/domains`} className="text-brand">
                      Buy a domain
                    </Link>
                    <Link href={data?.studio.project_url ?? `/project/${project.ref}`} className="text-brand">
                      Open project overview
                    </Link>
                  </div>
                  {Boolean(data?.hosting.custom_domain.verification_errors?.length) && (
                    <p className="text-sm text-warning">
                      {data?.hosting.custom_domain.verification_errors[0]}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-sm">Deployment requests</p>
                  <p className="text-sm text-foreground-light">
                    Native deployment jobs will appear here as they move through the Indobase runtime.
                  </p>
                </div>

                {isDeploymentsPending ? (
                  <GenericSkeletonLoader />
                ) : deployments.length === 0 ? (
                  <p className="text-sm text-foreground-light">
                    No deployments yet. Use Publish in Builder to ship your first release.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {deployments.map((deployment) => {
                      const executorSummary = getDeploymentExecutorSummary(deployment.metadata)

                      return (
                        <div
                          key={deployment.id}
                          className="rounded-md border border-default px-4 py-3 flex flex-col gap-1"
                        >
                        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                          <p className="text-sm font-medium">
                            {DEPLOYMENT_STATUS_LABELS[deployment.status] ?? deployment.status}
                          </p>
                          <div className="text-sm text-foreground-light">
                            <p>Requested {new Date(deployment.inserted_at).toLocaleString()}</p>
                            <p>Updated {new Date(deployment.updated_at).toLocaleString()}</p>
                            {deployment.completed_at && (
                              <p>Completed {new Date(deployment.completed_at).toLocaleString()}</p>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-foreground-light">{deployment.target_url}</p>
                        <p className="text-sm text-foreground-light">
                          Triggered via {deployment.requested_via}
                          {deployment.custom_domain_hostname
                            ? `, custom domain ${deployment.custom_domain_hostname}`
                            : ''}
                        </p>
                        {(executorSummary.attemptCount ||
                          executorSummary.lastAttemptedAt ||
                          executorSummary.heartbeatAt ||
                          executorSummary.leaseExpiresAt ||
                          executorSummary.healthCheckedAt ||
                          executorSummary.healthStatusCode !== null) && (
                          <p className="text-sm text-foreground-light">
                            {executorSummary.attemptCount
                              ? `Attempt ${executorSummary.attemptCount}`
                              : 'Awaiting runtime claim'}
                            {executorSummary.lastAttemptedAt
                              ? `, last attempt ${new Date(executorSummary.lastAttemptedAt).toLocaleString()}`
                              : ''}
                            {executorSummary.heartbeatAt
                              ? `, heartbeat ${new Date(executorSummary.heartbeatAt).toLocaleString()}`
                              : ''}
                            {executorSummary.leaseExpiresAt
                              ? `, lease until ${new Date(executorSummary.leaseExpiresAt).toLocaleString()}`
                              : ''}
                            {executorSummary.healthCheckedAt
                              ? `, health checked ${new Date(executorSummary.healthCheckedAt).toLocaleString()}`
                              : ''}
                            {executorSummary.healthStatusCode !== null
                              ? `, upstream ${executorSummary.healthStatusCode}`
                              : ''}
                            {executorSummary.attemptErrorCount
                              ? `, failures ${executorSummary.attemptErrorCount}`
                              : ''}
                            {executorSummary.workerId
                              ? `, worker ${executorSummary.workerId}`
                              : ''}
                          </p>
                        )}
                        {deployment.last_error && (
                          <p className="text-sm text-warning">{deployment.last_error}</p>
                        )}
                        {deployment.logs.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {deployment.logs.slice(-3).reverse().map((log, index) => (
                              <p
                                key={`${deployment.id}-log-${index}-${log.timestamp}`}
                                className="text-xs text-foreground-light"
                              >
                                [{new Date(log.timestamp).toLocaleString()}] {log.source}: {log.message}
                              </p>
                            ))}
                          </div>
                        )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </PageSectionContent>
    </PageSection>
  )
}
