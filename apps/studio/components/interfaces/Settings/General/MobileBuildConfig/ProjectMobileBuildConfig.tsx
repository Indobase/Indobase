import { useEffect, useMemo, useState } from 'react'

import { useCreateProjectMobileBuildMutation } from 'data/mobile/project-mobile-build-create-mutation'
import { useProjectMobileBuildsQuery } from 'data/mobile/project-mobile-builds-query'
import { useSelectedProjectQuery } from 'hooks/misc/useSelectedProject'
import { Button, Card, CardContent } from 'ui'
import {
  PageSection,
  PageSectionContent,
  PageSectionDescription,
  PageSectionMeta,
  PageSectionSummary,
  PageSectionTitle,
} from 'ui-patterns/PageSection'
import { GenericSkeletonLoader } from 'ui-patterns/ShimmeringLoader'

const MOBILE_BUILD_STATUS_LABELS: Record<string, string> = {
  archived: 'Archived',
  building: 'Building',
  failed: 'Failed',
  ready: 'Ready',
  requested: 'Requested',
}

const MOBILE_BUILD_FRAMEWORK_LABELS: Record<string, string> = {
  expo: 'Expo',
  flutter: 'Flutter',
  other: 'Other',
  react_native: 'React Native',
}

const MOBILE_BUILD_PRIORITY_LABELS: Record<string, string> = {
  priority: 'Priority',
  standard: 'Standard',
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function sanitizeAndroidPackageSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .replace(/^[^a-z]+/, '') || 'app'
}

function buildDefaultAndroidPackageName(projectRef?: string) {
  const safeRef = sanitizeAndroidPackageSegment(projectRef ?? '')
  return `com.indobase.${safeRef}`
}

function getMobileBuildExecutorSummary(metadata: Record<string, unknown>) {
  const executor = asRecord(metadata.executor)
  const attemptCount = typeof executor.attempt_count === 'number' ? executor.attempt_count : null
  const attemptErrorCount =
    typeof executor.attempt_error_count === 'number' ? executor.attempt_error_count : null
  const claimedAt = typeof executor.claimed_at === 'string' ? executor.claimed_at : null
  const heartbeatAt = typeof executor.heartbeat_at === 'string' ? executor.heartbeat_at : null
  const lastAttemptedAt =
    typeof executor.last_attempted_at === 'string' ? executor.last_attempted_at : null
  const leaseExpiresAt =
    typeof executor.lease_expires_at === 'string' ? executor.lease_expires_at : null
  const workerId = typeof executor.worker_id === 'string' ? executor.worker_id : null

  return {
    attemptCount,
    attemptErrorCount,
    claimedAt,
    heartbeatAt,
    lastAttemptedAt,
    leaseExpiresAt,
    workerId,
  }
}

export const ProjectMobileBuildConfig = () => {
  const { data: project } = useSelectedProjectQuery()
  const { data, isPending } = useProjectMobileBuildsQuery({ projectRef: project?.ref })
  const { mutate: createMobileBuild, isPending: isCreatingMobileBuild } =
    useCreateProjectMobileBuildMutation()

  const [framework, setFramework] = useState<'expo' | 'react_native' | 'flutter' | 'other'>('expo')
  const [androidPackageName, setAndroidPackageName] = useState('')
  const [versionName, setVersionName] = useState('1.0.0')
  const [versionCode, setVersionCode] = useState('1')
  const [instructions, setInstructions] = useState('')

  const builds = useMemo(() => data?.builds ?? [], [data?.builds])
  const hasActiveBuild = builds.some((build) => build.status === 'requested' || build.status === 'building')

  useEffect(() => {
    if (project?.ref) {
      setAndroidPackageName((current) => current || buildDefaultAndroidPackageName(project.ref))
    }
  }, [project?.ref])

  const readyArtifactsCount = useMemo(
    () => builds.reduce((count, build) => count + build.artifacts.length, 0),
    [builds]
  )

  return (
    <PageSection id="mobile-builds">
      <PageSectionMeta>
        <PageSectionSummary>
          <PageSectionTitle>Android Release Bundles</PageSectionTitle>
          <PageSectionDescription>
            Queue Android AAB builds, track worker progress, and download finished artifacts from one place.
          </PageSectionDescription>
        </PageSectionSummary>
      </PageSectionMeta>
      <PageSectionContent>
        {!project ? (
          <GenericSkeletonLoader />
        ) : (
          <Card>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <p className="text-sm">Framework</p>
                  <select
                    className="w-full rounded-md border border-default bg-surface-200 px-3 py-2 text-sm"
                    value={framework}
                    onChange={(event) =>
                      setFramework(event.target.value as 'expo' | 'react_native' | 'flutter' | 'other')
                    }
                  >
                    <option value="expo">Expo</option>
                    <option value="react_native">React Native</option>
                    <option value="flutter">Flutter</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="space-y-2">
                  <p className="text-sm">Android package name</p>
                  <input
                    className="w-full rounded-md border border-default bg-surface-200 px-3 py-2 text-sm"
                    value={androidPackageName}
                    onChange={(event) => setAndroidPackageName(event.target.value)}
                    placeholder="com.indobase.app"
                  />
                </label>
                <label className="space-y-2">
                  <p className="text-sm">Version name</p>
                  <input
                    className="w-full rounded-md border border-default bg-surface-200 px-3 py-2 text-sm"
                    value={versionName}
                    onChange={(event) => setVersionName(event.target.value)}
                    placeholder="1.0.0"
                  />
                </label>
                <label className="space-y-2">
                  <p className="text-sm">Version code</p>
                  <input
                    className="w-full rounded-md border border-default bg-surface-200 px-3 py-2 text-sm"
                    value={versionCode}
                    onChange={(event) => setVersionCode(event.target.value)}
                    inputMode="numeric"
                    placeholder="1"
                  />
                </label>
              </div>

              <label className="space-y-2 block">
                <p className="text-sm">Release notes for the build worker</p>
                <textarea
                  className="min-h-[96px] w-full rounded-md border border-default bg-surface-200 px-3 py-2 text-sm"
                  value={instructions}
                  onChange={(event) => setInstructions(event.target.value)}
                  placeholder="Optional instructions, source branch, signing notes, or release metadata."
                />
              </label>

              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-foreground-light">
                  {hasActiveBuild
                    ? 'A build is already in progress for this project.'
                    : 'Creating a request adds it to the Android build queue for the mobile executor.'}
                  {readyArtifactsCount > 0 ? ` ${readyArtifactsCount} artifact(s) are currently available.` : ''}
                </div>
                <Button
                  type="default"
                  disabled={!project.ref || !androidPackageName.trim() || hasActiveBuild}
                  loading={isCreatingMobileBuild}
                  onClick={() =>
                    createMobileBuild({
                      framework,
                      metadata: {
                        android_package_name: androidPackageName.trim(),
                        instructions: instructions.trim() || undefined,
                        version_code: versionCode.trim() || '1',
                        version_name: versionName.trim() || '1.0.0',
                      },
                      profile: 'production',
                      projectRef: project.ref,
                      requested_via: 'studio',
                      target: 'android_aab',
                    })
                  }
                >
                  {hasActiveBuild ? 'Build in progress' : 'Request Android AAB build'}
                </Button>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-sm">Build history</p>
                  <p className="text-sm text-foreground-light">
                    Queued builds appear here with worker leases, logs, and downloadable Android bundle artifacts.
                  </p>
                </div>

                {isPending ? (
                  <GenericSkeletonLoader />
                ) : builds.length === 0 ? (
                  <p className="text-sm text-foreground-light">
                    No Android bundle builds yet. Create one to start the native release workflow.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {builds.map((build) => {
                      const executorSummary = getMobileBuildExecutorSummary(build.metadata)
                      const applicationId =
                        typeof build.metadata.android_package_name === 'string'
                          ? build.metadata.android_package_name
                          : 'Unknown package'
                      const versionLabel =
                        typeof build.metadata.version_name === 'string'
                          ? build.metadata.version_name
                          : 'Unknown version'
                      const versionCodeLabel =
                        typeof build.metadata.version_code === 'number' ||
                        typeof build.metadata.version_code === 'string'
                          ? build.metadata.version_code
                          : 'Unknown code'

                      return (
                        <div
                          key={build.id}
                          className="rounded-md border border-default px-4 py-3 flex flex-col gap-2"
                        >
                          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                            <p className="text-sm font-medium">
                              {MOBILE_BUILD_STATUS_LABELS[build.status] ?? build.status}
                            </p>
                            <div className="text-sm text-foreground-light">
                              <p>Requested {new Date(build.inserted_at).toLocaleString()}</p>
                              <p>Updated {new Date(build.updated_at).toLocaleString()}</p>
                              {build.completed_at && (
                                <p>Completed {new Date(build.completed_at).toLocaleString()}</p>
                              )}
                            </div>
                          </div>

                          <p className="text-sm text-foreground-light">
                            {MOBILE_BUILD_FRAMEWORK_LABELS[build.framework] ?? build.framework} • {applicationId} •
                            {' '}v{versionLabel} ({versionCodeLabel})
                          </p>
                          <p className="text-sm text-foreground-light">
                            Requested via {build.requested_via} for {build.target} •{' '}
                            {MOBILE_BUILD_PRIORITY_LABELS[build.priority] ?? build.priority} queue
                          </p>

                          {(executorSummary.attemptCount ||
                            executorSummary.claimedAt ||
                            executorSummary.lastAttemptedAt ||
                            executorSummary.heartbeatAt ||
                            executorSummary.leaseExpiresAt) && (
                            <p className="text-sm text-foreground-light">
                              {executorSummary.attemptCount
                                ? `Attempt ${executorSummary.attemptCount}`
                                : 'Awaiting runtime claim'}
                              {executorSummary.claimedAt
                                ? `, claimed ${new Date(executorSummary.claimedAt).toLocaleString()}`
                                : ''}
                              {executorSummary.lastAttemptedAt
                                ? `, last attempt ${new Date(executorSummary.lastAttemptedAt).toLocaleString()}`
                                : ''}
                              {executorSummary.heartbeatAt
                                ? `, heartbeat ${new Date(executorSummary.heartbeatAt).toLocaleString()}`
                                : ''}
                              {executorSummary.leaseExpiresAt
                                ? `, lease until ${new Date(executorSummary.leaseExpiresAt).toLocaleString()}`
                                : ''}
                              {executorSummary.attemptErrorCount
                                ? `, failures ${executorSummary.attemptErrorCount}`
                                : ''}
                              {executorSummary.workerId ? `, worker ${executorSummary.workerId}` : ''}
                            </p>
                          )}

                          {build.last_error && (
                            <p className="text-sm text-warning">{build.last_error}</p>
                          )}

                          {build.artifacts.length > 0 && (
                            <div className="space-y-1">
                              {build.artifacts.map((artifact) => (
                                <a
                                  key={artifact.id}
                                  href={artifact.download_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block text-sm text-brand"
                                >
                                  Download {artifact.file_name}
                                  {artifact.size_bytes !== null
                                    ? ` (${Math.max(artifact.size_bytes / (1024 * 1024), 0).toFixed(2)} MB)`
                                    : ''}
                                </a>
                              ))}
                            </div>
                          )}

                          {build.logs.length > 0 && (
                            <div className="mt-1 space-y-1">
                              {build.logs.slice(-4).reverse().map((log, index) => (
                                <p
                                  key={`${build.id}-log-${index}-${log.timestamp}`}
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
